import { PERMISSIONS } from '../constants/permissions.js';
import { assertPermission } from '../guards/roleGuard.js';
import { SHEET_TYPES } from '../constants/app.js';
import { COLLECTIONS, ORDER_SOURCE, LOG_ACTIONS } from '../constants/firestore.js';
import { parseExcelPaste } from '../utils/excelParser.js';
import { createTimestamp } from '../utils/dateFormatter.js';
import {
  createAuditActor,
  createBaseOrderRecord,
  createOrderLogRecord,
  normalizeOrderRecord,
  reconcileProductItems
} from '../utils/firestoreMappers.js';
import { executeTransaction, fetchDocument, getNewOrderLogRef, getOrderRef } from '../firebase/firestore.js';
import { acquireImportLock, getImportLock, getImportLockMessage, releaseImportLock } from './systemLockService.js';

export async function previewImportedOrders({ rawText, sheetType, actor }) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_IMPORT);

  if (!SHEET_TYPES.includes(sheetType)) {
    throw new Error('Please select a valid sheet type.');
  }

  if (!String(rawText ?? '').trim()) {
    throw new Error('Paste Excel data before preview.');
  }

  const result = parseExcelPaste({
    rawText,
    sheetType
  });
  const previewCreatedAt = createTimestamp();

  console.info('[importService] previewImportedOrders', {
    sheetType,
    inputRowCount: result.inputRowCount,
    validRowCount: result.validRowCount,
    ignoredRowCount: result.ignoredRowCount,
    aggregateCount: result.aggregateCount,
    warnings: result.warnings.length,
    errors: result.errors.length
  });

  return {
    ...result,
    previewCreatedAt
  };
}

function getOrderLastChangeAt(order) {
  return Math.max(
    Number(order?.updatedAt ?? 0),
    Number(order?.createdAt ?? 0)
  );
}

function buildImportedOrderRecord({ previewRow, sheetType, actor, timestamp, existingOrder }) {
  const normalizedActor = createAuditActor(actor);
  const payload = {
    orderId: previewRow.orderId,
    time: existingOrder?.time ?? timestamp,
    date: previewRow.date,
    trackingId: previewRow.trackingId,
    isPrintOrder: existingOrder?.isPrintOrder ?? false,
    isOrderCompleted: false,
    printCount: existingOrder?.printCount ?? 0,
    lastPrintedAt: existingOrder?.lastPrintedAt ?? null,
    source: ORDER_SOURCE.EXCEL_PASTE,
    importSheetType: sheetType,
    status: 'open',
    version: existingOrder ? (existingOrder.version ?? 1) + 1 : 1,
    deleted: false,
    productItems: reconcileProductItems(existingOrder?.productItems ?? [], previewRow.productLines),
    productLines: previewRow.productLines,
    createdAt: existingOrder?.createdAt ?? timestamp,
    createdBy: existingOrder?.createdBy ?? normalizedActor,
    updatedBy: normalizedActor
  };

  return createBaseOrderRecord(payload, normalizedActor, timestamp);
}

export async function createOrdersFromPreview({
  previewResult,
  actor,
  overwriteExisting = false
}) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_IMPORT);
  assertPermission(actor?.role, PERMISSIONS.ORDERS_CREATE);

  if (!previewResult?.canCreateOrders) {
    throw new Error('Preview result is not ready for order creation.');
  }

  if (!previewResult?.previewCreatedAt) {
    throw new Error('Preview is missing freshness metadata. Please parse preview again.');
  }

  const timestamp = createTimestamp();
  const duplicates = [];
  const writes = new Map();
  const staleOrderIds = [];

  for (const previewRow of previewResult.previewRows) {
    const existingOrder = normalizeOrderRecord(
      await fetchDocument(COLLECTIONS.ORDERS, previewRow.orderId)
    );

    if (existingOrder && getOrderLastChangeAt(existingOrder) > Number(previewResult.previewCreatedAt)) {
      staleOrderIds.push(previewRow.orderId);
    }

    if (existingOrder) {
      duplicates.push({
        orderId: previewRow.orderId,
        trackingId: existingOrder.trackingId,
        status: existingOrder.status
      });

      if (!overwriteExisting) {
        continue;
      }
    }
  }

  if (staleOrderIds.length) {
    throw new Error(
      `Preview is outdated because these orders changed after preview: ${[...new Set(staleOrderIds)].join(', ')}. Parse Preview again before creating orders.`
    );
  }

  if (duplicates.length && !overwriteExisting) {
    console.info('[importService] createOrdersFromPreview blocked by duplicates', duplicates);
    return {
      success: false,
      requiresOverwriteConfirmation: true,
      duplicates,
      createdCount: 0,
      updatedCount: 0
    };
  }

  const currentLock = await getImportLock(actor);
  if (currentLock.active) {
    throw new Error(getImportLockMessage(currentLock));
  }

  await acquireImportLock(actor);

  try {
    await executeTransaction(async (transaction) => {
      const snapshotRecords = [];

      for (const previewRow of previewResult.previewRows) {
        const orderRef = getOrderRef(previewRow.orderId);
        const snapshot = await transaction.get(orderRef);
        const existingOrder = snapshot.exists()
          ? normalizeOrderRecord({ id: snapshot.id, ...snapshot.data() })
          : null;

        snapshotRecords.push({
          previewRow,
          orderRef,
          existingOrder
        });
      }

      for (const item of snapshotRecords) {
        const { previewRow, orderRef, existingOrder } = item;

        if (existingOrder && !overwriteExisting) {
          throw new Error(`Order ${previewRow.orderId} already exists. Reload preview and confirm overwrite.`);
        }

        const nextRecord = buildImportedOrderRecord({
          previewRow,
          sheetType: previewResult.sheetType,
          actor,
          timestamp,
          existingOrder
        });

        transaction.set(orderRef, nextRecord);
        transaction.set(
          getNewOrderLogRef(previewRow.orderId),
          createOrderLogRecord({
            action: existingOrder ? LOG_ACTIONS.UPDATE_ORDER : LOG_ACTIONS.CREATE_ORDER_FROM_IMPORT,
            actor,
            changes: existingOrder
              ? {
                  before: existingOrder,
                  after: normalizeOrderRecord({ id: previewRow.orderId, ...nextRecord })
                }
              : {
                  after: normalizeOrderRecord({ id: previewRow.orderId, ...nextRecord })
                },
            note: existingOrder
              ? 'Order overwritten from import preview.'
              : 'Order created from import preview.',
            createdAt: timestamp
          })
        );

        writes.set(previewRow.orderId, {
          orderId: previewRow.orderId,
          existingOrder,
          nextRecord
        });
      }
    });
  } finally {
    await releaseImportLock(actor);
  }

  const writeList = [...writes.values()];
  const createdCount = writeList.filter((item) => !item.existingOrder).length;
  const updatedCount = writeList.filter((item) => Boolean(item.existingOrder)).length;

  console.info('[importService] createOrdersFromPreview completed', {
    createdCount,
    updatedCount,
    sheetType: previewResult.sheetType
  });

  return {
    success: true,
    requiresOverwriteConfirmation: false,
    duplicates,
    createdCount,
    updatedCount,
    createdOrderIds: writeList.map((item) => item.orderId)
  };
}

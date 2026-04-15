import { PERMISSIONS } from '../constants/permissions.js';
import { assertPermission } from '../guards/roleGuard.js';
import { SHEET_TYPES } from '../constants/app.js';
import { ORDER_SOURCE, LOG_ACTIONS } from '../constants/firestore.js';
import { parseExcelPaste } from '../utils/excelParser.js';
import { createTimestamp } from '../utils/dateFormatter.js';
import {
  createAuditActor,
  createBaseOrderRecord,
  createOrderLogRecord,
  normalizeOrderRecord,
  reconcileProductItems
} from '../utils/firestoreMappers.js';
import {
  createOrdersByIdsQuery,
  executeTransaction,
  fetchCollectionRecords,
  getNewOrderLogRef,
  getOrderRef
} from '../firebase/firestore.js';
import { acquireImportLock, getImportLock, getImportLockMessage, releaseImportLock } from './systemLockService.js';

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function findExistingOrdersByIds(orderIds = []) {
  const uniqueOrderIds = [...new Set(orderIds.map((item) => String(item ?? '').trim()).filter(Boolean))];

  if (!uniqueOrderIds.length) {
    return [];
  }

  const records = [];

  for (const chunk of chunkArray(uniqueOrderIds, 10)) {
    const queryObject = createOrdersByIdsQuery(chunk);

    if (!queryObject) {
      continue;
    }

    const chunkRecords = await fetchCollectionRecords(queryObject);
    records.push(...chunkRecords.map(normalizeOrderRecord).filter(Boolean));
  }

  return records;
}

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
  const existingOrders = await findExistingOrdersByIds(
    result.previewRows.map((item) => item.orderId)
  );
  const existingOrderErrors = existingOrders.map((order) => ({
    type: 'ORDER_ID_ALREADY_EXISTS',
    orderId: order.orderId,
    trackingId: order.trackingId,
    message: `Order ID ${order.orderId} already exists and cannot be imported again.`
  }));
  const errors = [...result.errors, ...existingOrderErrors];

  console.info('[importService] previewImportedOrders', {
    sheetType,
    inputRowCount: result.inputRowCount,
    validRowCount: result.validRowCount,
    ignoredRowCount: result.ignoredRowCount,
    aggregateCount: result.aggregateCount,
    warnings: result.warnings.length,
    errors: errors.length
  });

  return {
    ...result,
    errors,
    previewCreatedAt
    ,
    canCreateOrders: errors.length === 0 && result.warnings.length === 0 && result.previewRows.length > 0
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
  actor
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
  const writes = new Map();
  const staleOrderIds = [];
  const existingOrders = await findExistingOrdersByIds(
    previewResult.previewRows.map((item) => item.orderId)
  );
  const existingOrderIds = new Set(existingOrders.map((item) => item.orderId));

  for (const previewRow of previewResult.previewRows) {
    const existingOrder = existingOrders.find((item) => item.orderId === previewRow.orderId) ?? null;

    if (existingOrder && getOrderLastChangeAt(existingOrder) > Number(previewResult.previewCreatedAt)) {
      staleOrderIds.push(previewRow.orderId);
    }
  }

  if (staleOrderIds.length) {
    throw new Error(
      `This preview is outdated because these orders changed after the preview was generated: ${[...new Set(staleOrderIds)].join(', ')}. Please run Parse Preview again before creating orders.`
    );
  }

  if (existingOrderIds.size) {
    throw new Error(
      `These order IDs already exist and cannot be created again: ${[...existingOrderIds].join(', ')}. Please remove them from the import file and parse again.`
    );
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

        if (existingOrder) {
          throw new Error(`Order ${previewRow.orderId} already exists. Remove it from the import file and parse again.`);
        }

        const nextRecord = buildImportedOrderRecord({
          previewRow,
          sheetType: previewResult.sheetType,
          actor,
          timestamp,
          existingOrder: null
        });

        transaction.set(orderRef, nextRecord);
        transaction.set(
          getNewOrderLogRef(previewRow.orderId),
          createOrderLogRecord({
            action: LOG_ACTIONS.CREATE_ORDER_FROM_IMPORT,
            actor,
            changes: {
              after: normalizeOrderRecord({ id: previewRow.orderId, ...nextRecord })
            },
            note: 'Order created from import preview.',
            createdAt: timestamp
          })
        );

        writes.set(previewRow.orderId, {
          orderId: previewRow.orderId,
          nextRecord
        });
      }
    });
  } finally {
    await releaseImportLock(actor);
  }

  const writeList = [...writes.values()];
  const createdCount = writeList.length;

  console.info('[importService] createOrdersFromPreview completed', {
    createdCount,
    sheetType: previewResult.sheetType
  });

  return {
    success: true,
    createdCount,
    createdOrderIds: writeList.map((item) => item.orderId)
  };
}

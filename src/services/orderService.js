import { getDocs } from 'firebase/firestore';
import { ORDER_STATUS, PRODUCT_ITEM_STATUS } from '../constants/app.js';
import {
  COLLECTIONS,
  DEFAULT_ORDER_QUERY_LIMIT,
  LOG_ACTIONS
} from '../constants/firestore.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { assertPermission } from '../guards/roleGuard.js';
import {
  createOrdersQuery,
  executeTransaction,
  fetchDocument,
  getNewOrderLogRef,
  getOrderRef,
  subscribeToQuery
} from '../firebase/firestore.js';
import {
  createAuditActor,
  createBaseOrderRecord,
  createOrderLogRecord,
  mapDocumentSnapshot,
  mapQuerySnapshot,
  normalizeOrderRecord,
  reconcileProductItems
} from '../utils/firestoreMappers.js';
import { createTimestamp } from '../utils/dateFormatter.js';
import { validateOrderEditPayload, validateOrderPayload, validateRequiredString } from '../utils/validators.js';
import { assertImportNotLocked } from './systemLockService.js';

export async function getOrderById(orderId, actor) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_VIEW);

  const document = await fetchDocument(COLLECTIONS.ORDERS, validateRequiredString(orderId, 'orderId'));
  return normalizeOrderRecord(document);
}

export async function listOrders(filters = {}, actor) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_VIEW);

  const queryObject = createOrdersQuery({
    limitCount: filters.limitCount ?? DEFAULT_ORDER_QUERY_LIMIT
  });

  const snapshot = await getDocs(queryObject);
  return mapQuerySnapshot(snapshot).map(normalizeOrderRecord);
}

export function subscribeOrders(filters = {}, actor, callback) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_VIEW);

  const queryObject = createOrdersQuery({
    limitCount: filters.limitCount ?? DEFAULT_ORDER_QUERY_LIMIT
  });

  return subscribeToQuery(queryObject, (records) => {
    callback(records.map(normalizeOrderRecord));
  });
}

export async function createOrder(payload, actor) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_CREATE);

  const normalizedActor = createAuditActor(actor);
  const timestamp = createTimestamp();
  const normalizedPayload = validateOrderPayload(payload);
  const record = createBaseOrderRecord(normalizedPayload, normalizedActor, timestamp);

  await executeTransaction(async (transaction) => {
    const orderRef = getOrderRef(record.orderId);
    const logRef = getNewOrderLogRef(record.orderId);
    const existing = await transaction.get(orderRef);

    if (existing.exists()) {
      throw new Error(`Order ${record.orderId} already exists.`);
    }

    transaction.set(orderRef, record);
    transaction.set(
      logRef,
      createOrderLogRecord({
        action: LOG_ACTIONS.CREATE_ORDER,
        actor: normalizedActor,
        changes: { after: normalizeOrderRecord({ id: record.orderId, ...record }) },
        note: 'Order created.',
        createdAt: timestamp
      })
    );
  });

  console.info(`[orderService] createOrder ${record.orderId}`, record);

  return record;
}

export async function updateOrder(orderId, updates, actor, options = {}) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_EDIT);

  const normalizedOrderId = validateRequiredString(orderId, 'orderId');
  const normalizedActor = createAuditActor(actor);
  const timestamp = createTimestamp();
  const orderRef = getOrderRef(normalizedOrderId);
  const normalizedUpdates = validateOrderEditPayload(updates);
  const expectedVersion =
    typeof options.expectedVersion === 'number' ? options.expectedVersion : null;

  let beforeRecord = null;
  let afterRecord = null;

  await executeTransaction(async (transaction) => {
    const logRef = getNewOrderLogRef(normalizedOrderId);
    const snapshot = await transaction.get(orderRef);

    if (!snapshot.exists()) {
      throw new Error(`Order ${normalizedOrderId} does not exist.`);
    }

    beforeRecord = mapDocumentSnapshot(snapshot);

    if (
      expectedVersion !== null &&
      Number(beforeRecord.version ?? 1) !== Number(expectedVersion)
    ) {
      throw new Error(`Order ${normalizedOrderId} was updated by another user. Reload and try again.`);
    }

    afterRecord = {
      ...beforeRecord,
      ...normalizedUpdates,
      productItems: reconcileProductItems(beforeRecord.productItems, normalizedUpdates.productLines),
      status: ORDER_STATUS.OPEN,
      isOrderCompleted: false,
      deleted: false,
      version: (beforeRecord.version ?? 1) + 1,
      updatedAt: timestamp,
      updatedBy: normalizedActor
    };

    transaction.update(orderRef, {
      date: afterRecord.date,
      trackingId: afterRecord.trackingId,
      productItems: afterRecord.productItems,
      productLines: afterRecord.productLines,
      status: afterRecord.status,
      isOrderCompleted: afterRecord.isOrderCompleted,
      deleted: afterRecord.deleted,
      version: afterRecord.version,
      updatedAt: afterRecord.updatedAt,
      updatedBy: afterRecord.updatedBy
    });

    transaction.set(
      logRef,
      createOrderLogRecord({
        action: LOG_ACTIONS.UPDATE_ORDER,
        actor: normalizedActor,
        changes: {
          before: beforeRecord,
          after: afterRecord
        },
        note: 'Order updated.',
        createdAt: timestamp
      })
    );
  });

  console.info(`[orderService] updateOrder ${normalizedOrderId}`, afterRecord);

  return normalizeOrderRecord(afterRecord);
}

export async function createOrdersBatch(orders, actor) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_CREATE);

  const normalizedActor = createAuditActor(actor);
  const timestamp = createTimestamp();
  const normalizedPayloads = orders.map((orderPayload) => validateOrderPayload(orderPayload));
  const createdOrders = normalizedPayloads.map((payload) =>
    createBaseOrderRecord(payload, normalizedActor, timestamp)
  );

  await executeTransaction(async (transaction) => {
    for (const record of createdOrders) {
      const orderRef = getOrderRef(record.orderId);
      const logRef = getNewOrderLogRef(record.orderId);
      const existing = await transaction.get(orderRef);

      if (existing.exists()) {
        throw new Error(`Order ${record.orderId} already exists.`);
      }

      transaction.set(orderRef, record);
      transaction.set(
        logRef,
        createOrderLogRecord({
          action: LOG_ACTIONS.CREATE_ORDER,
          actor: normalizedActor,
          changes: { after: normalizeOrderRecord({ id: record.orderId, ...record }) },
          note: 'Order created from batch.',
          createdAt: timestamp
        })
      );
    }
  });

  console.info(`[orderService] createOrdersBatch count=${createdOrders.length}`);
  return createdOrders.map(normalizeOrderRecord);
}

export async function printOrders(orderIds, actor) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_PRINT);

  const normalizedActor = createAuditActor(actor);
  const uniqueOrderIds = [...new Set(orderIds.map((item) => validateRequiredString(item, 'orderId')))];
  const processed = new Map();

  await executeTransaction(async (transaction) => {
    await assertImportNotLocked(actor, transaction);

    for (const orderId of uniqueOrderIds) {
      const orderRef = getOrderRef(orderId);
      const snapshot = await transaction.get(orderRef);

      if (!snapshot.exists()) {
        throw new Error(`Order ${orderId} does not exist.`);
      }

      const beforeRecord = normalizeOrderRecord(mapDocumentSnapshot(snapshot));

      if (beforeRecord.status === ORDER_STATUS.CANCELLED || beforeRecord.deleted) {
        throw new Error(`Cancelled order ${orderId} cannot be printed.`);
      }

      const timestamp = createTimestamp();
      const nextStatus =
        beforeRecord.status === ORDER_STATUS.COMPLETED
          ? ORDER_STATUS.COMPLETED
          : ORDER_STATUS.PRINTED;
      const action =
        (beforeRecord.printCount ?? 0) > 0 ? LOG_ACTIONS.REPRINT_ORDER : LOG_ACTIONS.PRINT_ORDER;

      const afterRecord = {
        ...beforeRecord,
        isPrintOrder: true,
        printCount: (beforeRecord.printCount ?? 0) + 1,
        lastPrintedAt: timestamp,
        status: nextStatus,
        updatedAt: timestamp,
        updatedBy: normalizedActor
      };

      transaction.update(orderRef, {
        isPrintOrder: afterRecord.isPrintOrder,
        printCount: afterRecord.printCount,
        lastPrintedAt: afterRecord.lastPrintedAt,
        status: afterRecord.status,
        updatedAt: afterRecord.updatedAt,
        updatedBy: afterRecord.updatedBy
      });
      transaction.set(
        getNewOrderLogRef(orderId),
        createOrderLogRecord({
          action,
          actor: normalizedActor,
          changes: {
            before: beforeRecord,
            after: afterRecord
          },
          note: action === LOG_ACTIONS.REPRINT_ORDER ? 'Order reprinted.' : 'Order printed.',
          createdAt: timestamp
        })
      );

      processed.set(orderId, {
        orderId,
        beforeRecord,
        afterRecord,
        action
      });
    }
  });

  console.info(`[orderService] printOrders count=${processed.size}`, {
    orderIds: [...processed.keys()]
  });

  return [...processed.values()].map((item) => normalizeOrderRecord(item.afterRecord));
}

export async function completeOrder(orderId, actor) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_COMPLETE);

  const normalizedOrderId = validateRequiredString(orderId, 'orderId');
  const normalizedActor = createAuditActor(actor);
  const timestamp = createTimestamp();
  let beforeRecord = null;
  let afterRecord = null;

  await executeTransaction(async (transaction) => {
    const orderRef = getOrderRef(normalizedOrderId);
    const logRef = getNewOrderLogRef(normalizedOrderId);
    const snapshot = await transaction.get(orderRef);

    if (!snapshot.exists()) {
      throw new Error(`Order ${normalizedOrderId} does not exist.`);
    }

    beforeRecord = normalizeOrderRecord(mapDocumentSnapshot(snapshot));

    if (beforeRecord.status === ORDER_STATUS.CANCELLED || beforeRecord.deleted) {
      throw new Error(`Cancelled order ${normalizedOrderId} cannot be completed.`);
    }

    afterRecord = {
      ...beforeRecord,
      isOrderCompleted: true,
      status: ORDER_STATUS.COMPLETED,
      deleted: false,
      productItems: (beforeRecord.productItems ?? []).map((item) => ({
        ...item,
        status: PRODUCT_ITEM_STATUS.COMPLETED
      })),
      productLines: (beforeRecord.productItems ?? []).map((item) => item.name),
      updatedAt: timestamp,
      updatedBy: normalizedActor
    };

    transaction.update(orderRef, {
      isOrderCompleted: true,
      status: ORDER_STATUS.COMPLETED,
      deleted: false,
      productItems: afterRecord.productItems,
      productLines: afterRecord.productLines,
      updatedAt: timestamp,
      updatedBy: normalizedActor
    });

    transaction.set(
      logRef,
      createOrderLogRecord({
        action: LOG_ACTIONS.COMPLETE_ORDER,
        actor: normalizedActor,
        changes: {
          before: beforeRecord,
          after: afterRecord
        },
        note: 'Order completed.',
        createdAt: timestamp
      })
    );
  });

  console.info(`[orderService] completeOrder ${normalizedOrderId}`);

  return normalizeOrderRecord(afterRecord);
}

export async function cancelOrder(orderId, actor) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_CANCEL);

  const normalizedOrderId = validateRequiredString(orderId, 'orderId');
  const normalizedActor = createAuditActor(actor);
  const timestamp = createTimestamp();
  let beforeRecord = null;
  let afterRecord = null;

  await executeTransaction(async (transaction) => {
    const orderRef = getOrderRef(normalizedOrderId);
    const logRef = getNewOrderLogRef(normalizedOrderId);
    const snapshot = await transaction.get(orderRef);

    if (!snapshot.exists()) {
      throw new Error(`Order ${normalizedOrderId} does not exist.`);
    }

    beforeRecord = normalizeOrderRecord(mapDocumentSnapshot(snapshot));

    if (beforeRecord.status === ORDER_STATUS.COMPLETED) {
      throw new Error(`Completed order ${normalizedOrderId} cannot be cancelled.`);
    }

    afterRecord = {
      ...beforeRecord,
      status: ORDER_STATUS.CANCELLED,
      deleted: true,
      isOrderCompleted: false,
      updatedAt: timestamp,
      updatedBy: normalizedActor
    };

    transaction.update(orderRef, {
      status: ORDER_STATUS.CANCELLED,
      deleted: true,
      isOrderCompleted: false,
      updatedAt: timestamp,
      updatedBy: normalizedActor
    });

    transaction.set(
      logRef,
      createOrderLogRecord({
        action: LOG_ACTIONS.CANCEL_ORDER,
        actor: normalizedActor,
        changes: {
          before: beforeRecord,
          after: afterRecord
        },
        note: 'Order cancelled.',
        createdAt: timestamp
      })
    );
  });

  console.info(`[orderService] cancelOrder ${normalizedOrderId}`);

  return normalizeOrderRecord(afterRecord);
}

export async function updateProductItem(orderId, productItemUpdate, actor) {
  return updateProductItems(orderId, [productItemUpdate], actor);
}

export async function updateProductItems(orderId, productItemUpdates, actor) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_ITEM_UPDATE);

  const normalizedOrderId = validateRequiredString(orderId, 'orderId');
  if (!Array.isArray(productItemUpdates) || !productItemUpdates.length) {
    throw new Error('At least one product item update is required.');
  }

  const normalizedActor = createAuditActor(actor);
  const timestamp = createTimestamp();
  let beforeRecord = null;
  let afterRecord = null;

  await executeTransaction(async (transaction) => {
    const orderRef = getOrderRef(normalizedOrderId);
    const logRef = getNewOrderLogRef(normalizedOrderId);
    const snapshot = await transaction.get(orderRef);

    if (!snapshot.exists()) {
      throw new Error(`Order ${normalizedOrderId} does not exist.`);
    }

    beforeRecord = normalizeOrderRecord(mapDocumentSnapshot(snapshot));

    if (beforeRecord.status === ORDER_STATUS.CANCELLED || beforeRecord.status === ORDER_STATUS.COMPLETED) {
      throw new Error(`Order ${normalizedOrderId} cannot update product items in its current status.`);
    }

    const allowedStatuses = [
      PRODUCT_ITEM_STATUS.PENDING,
      PRODUCT_ITEM_STATUS.READY,
      PRODUCT_ITEM_STATUS.MISSING,
      PRODUCT_ITEM_STATUS.FULFILLED
    ];

    const updatesById = new Map(
      productItemUpdates.map((item) => {
        const itemId = validateRequiredString(item?.itemId, 'itemId');
        const nextStatus = validateRequiredString(item?.status, 'status');

        if (!allowedStatuses.includes(nextStatus)) {
          throw new Error('Invalid product item status.');
        }

        return [
          itemId,
          {
            itemId,
            status: nextStatus,
            note: String(item?.note ?? '').trim()
          }
        ];
      })
    );

    const nextProductItems = (beforeRecord.productItems ?? []).map((item) => {
      const itemUpdate = updatesById.get(item.id);

      if (!itemUpdate) {
        return item;
      }

      const warehouseChecked = itemUpdate.status !== PRODUCT_ITEM_STATUS.PENDING;

      return {
        ...item,
        status: itemUpdate.status,
        warehouseChecked,
        warehouseCheckedAt: warehouseChecked ? timestamp : null,
        warehouseCheckedBy: warehouseChecked ? normalizedActor : null,
        fulfilledAt:
          itemUpdate.status === PRODUCT_ITEM_STATUS.FULFILLED
            ? timestamp
            : itemUpdate.status === PRODUCT_ITEM_STATUS.PENDING
              ? null
              : item.fulfilledAt ?? null,
        fulfilledBy:
          itemUpdate.status === PRODUCT_ITEM_STATUS.FULFILLED
            ? normalizedActor
            : itemUpdate.status === PRODUCT_ITEM_STATUS.PENDING
              ? null
              : item.fulfilledBy ?? null,
        note: itemUpdate.note
      };
    });

    const changedItems = [];

    for (const beforeItem of beforeRecord.productItems ?? []) {
      const afterItem = nextProductItems.find((item) => item.id === beforeItem.id);

      if (!afterItem) {
        continue;
      }

      if (JSON.stringify(beforeItem) !== JSON.stringify(afterItem)) {
        changedItems.push({ beforeItem, afterItem });
      }
    }

    if (!changedItems.length) {
      throw new Error('No product item changes to save.');
    }

    afterRecord = {
      ...beforeRecord,
      productItems: nextProductItems,
      productLines: nextProductItems.map((item) => item.name),
      updatedAt: timestamp,
      updatedBy: normalizedActor
    };

    transaction.update(orderRef, {
      productItems: afterRecord.productItems,
      productLines: afterRecord.productLines,
      updatedAt: afterRecord.updatedAt,
      updatedBy: afterRecord.updatedBy
    });

    for (const changedItem of changedItems) {
      transaction.set(
        getNewOrderLogRef(normalizedOrderId),
        createOrderLogRecord({
          action: LOG_ACTIONS.UPDATE_PRODUCT_ITEM,
          actor: normalizedActor,
          changes: {
            itemId: changedItem.beforeItem.id,
            itemName: changedItem.beforeItem.name,
            beforeItem: changedItem.beforeItem,
            afterItem: changedItem.afterItem
          },
          note: `Product item "${changedItem.beforeItem.name}" updated to ${changedItem.afterItem.status}.`,
          createdAt: timestamp
        })
      );
    }
  });

  console.info(`[orderService] updateProductItems ${normalizedOrderId}`, {
    count: productItemUpdates.length
  });

  return normalizeOrderRecord(afterRecord);
}

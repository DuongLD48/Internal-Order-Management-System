import { ORDER_SOURCE } from '../constants/firestore.js';
import { ORDER_STATUS, PRODUCT_ITEM_STATUS } from '../constants/app.js';
import { buildProductItemsFromLines, validateProductItems } from './validators.js';

function cloneActor(actor = {}) {
  return {
    uid: actor.uid ?? '',
    email: actor.email ?? '',
    name: actor.name ?? actor.email ?? ''
  };
}

export function mapDocumentSnapshot(snapshot) {
  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data()
  };
}

export function mapQuerySnapshot(snapshot) {
  return snapshot.docs
    .map((docItem) => mapDocumentSnapshot(docItem))
    .filter(Boolean);
}

export function createAuditActor(actor) {
  if (!actor?.uid) {
    throw new Error('A signed-in actor is required for this action.');
  }

  return cloneActor(actor);
}

export function createBaseOrderRecord(payload, actor, timestamp) {
  const productItems = validateProductItems(payload.productItems, payload.productLines ?? []);

  return {
    time: payload.time ?? timestamp,
    date: payload.date,
    trackingId: payload.trackingId,
    isPrintOrder: payload.isPrintOrder ?? false,
    isOrderCompleted: payload.isOrderCompleted ?? false,
    printCount: payload.printCount ?? 0,
    lastPrintedAt: payload.lastPrintedAt ?? null,
    source: payload.source ?? ORDER_SOURCE.MANUAL,
    importSheetType: payload.importSheetType ?? null,
    status: payload.status ?? ORDER_STATUS.OPEN,
    version: payload.version ?? 1,
    deleted: payload.deleted ?? false,
    productItems,
    productLines: productItems.map((item) => item.name),
    createdAt: payload.createdAt ?? timestamp,
    updatedAt: timestamp,
    createdBy: payload.createdBy ?? cloneActor(actor),
    updatedBy: cloneActor(actor)
  };
}

export function reconcileProductItems(existingItems = [], nextProductLines = []) {
  const normalizedLines = nextProductLines
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);

  if (!normalizedLines.length) {
    return [];
  }

  const normalizedExisting = Array.isArray(existingItems) && existingItems.length
    ? validateProductItems(existingItems, normalizedLines)
    : [];
  const usedIndexes = new Set();

  return normalizedLines.map((name, index) => {
    const matchedIndex = normalizedExisting.findIndex(
      (item, itemIndex) => !usedIndexes.has(itemIndex) && item.name === name
    );

    if (matchedIndex >= 0) {
      usedIndexes.add(matchedIndex);
      const matched = normalizedExisting[matchedIndex];

      return {
        ...matched,
        id: matched.id || `line_${index + 1}`,
        name
      };
    }

    return {
      id: `line_${index + 1}`,
      name,
      status: PRODUCT_ITEM_STATUS.PENDING,
      warehouseChecked: false,
      warehouseCheckedAt: null,
      warehouseCheckedBy: null,
      fulfilledAt: null,
      fulfilledBy: null,
      note: ''
    };
  });
}

export function normalizeOrderRecord(document) {
  if (!document) {
    return null;
  }

  const orderId = document.orderId ?? document.id ?? '';
  const fallbackProductLines = Array.isArray(document.productLines) && document.productLines.length
    ? document.productLines
    : String(document.product ?? '')
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  const productItems = validateProductItems(document.productItems, fallbackProductLines);
  const productLines = productItems.map((item) => item.name);

  return {
    ...document,
    orderId,
    productItems,
    productLines,
    productText: productLines.join('\n')
  };
}

export function createOrderLogRecord({ action, actor, changes = {}, note = '', createdAt }) {
  return {
    action,
    createdAt,
    createdBy: cloneActor(actor),
    changes,
    note
  };
}

export function normalizeUserProfile(document) {
  if (!document) {
    return null;
  }

  return {
    uid: document.uid ?? document.id ?? '',
    email: document.email ?? '',
    name: document.name ?? '',
    role: document.role ?? 'viewer',
    active: Boolean(document.active),
    createdAt: document.createdAt ?? 0,
    updatedAt: document.updatedAt ?? 0
  };
}

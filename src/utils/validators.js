import { ORDER_STATUS, PRODUCT_ITEM_STATUS, ROLE_OPTIONS, SHEET_TYPES } from '../constants/app.js';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isDisplayDate(value) {
  return /^\d{2}\/\d{2}$/.test(value);
}

export function validateRequiredString(value, fieldName) {
  if (!isNonEmptyString(value)) {
    throw new Error(`${fieldName} is required.`);
  }

  return value.trim();
}

export function validateRole(role) {
  if (!ROLE_OPTIONS.includes(role)) {
    throw new Error('Invalid user role.');
  }

  return role;
}

export function validateSheetType(sheetType) {
  if (sheetType === null || sheetType === undefined || sheetType === '') {
    return null;
  }

  if (!SHEET_TYPES.includes(sheetType)) {
    throw new Error('Invalid import sheet type.');
  }

  return sheetType;
}

export function validateOrderStatus(status) {
  const allowed = Object.values(ORDER_STATUS);

  if (!allowed.includes(status)) {
    throw new Error('Invalid order status.');
  }

  return status;
}

export function validateBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean.`);
  }

  return value;
}

export function validateProductLines(productLines) {
  if (!Array.isArray(productLines)) {
    throw new Error('productLines must be an array.');
  }

  const normalized = productLines
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);

  if (!normalized.length) {
    throw new Error('productLines must contain at least one value.');
  }

  return normalized;
}

function normalizeActorRef(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return {
    uid: String(value.uid ?? '').trim(),
    email: String(value.email ?? '').trim(),
    name: String(value.name ?? '').trim()
  };
}

export function buildProductItemsFromLines(productLines) {
  return validateProductLines(productLines).map((name, index) => ({
    id: `line_${index + 1}`,
    name,
    status: PRODUCT_ITEM_STATUS.PENDING,
    warehouseChecked: false,
    warehouseCheckedAt: null,
    warehouseCheckedBy: null,
    fulfilledAt: null,
    fulfilledBy: null,
    note: ''
  }));
}

export function validateProductItems(productItems, fallbackProductLines = []) {
  if (!Array.isArray(productItems) || !productItems.length) {
    return buildProductItemsFromLines(fallbackProductLines);
  }

  const allowedStatuses = Object.values(PRODUCT_ITEM_STATUS);

  const normalized = productItems
    .map((item, index) => {
      const name = String(item?.name ?? '').trim();

      if (!name) {
        return null;
      }

      const status = allowedStatuses.includes(item?.status)
        ? item.status
        : PRODUCT_ITEM_STATUS.PENDING;

      return {
        id: String(item?.id ?? `line_${index + 1}`).trim() || `line_${index + 1}`,
        name,
        status,
        warehouseChecked: Boolean(item?.warehouseChecked),
        warehouseCheckedAt: item?.warehouseCheckedAt ?? null,
        warehouseCheckedBy: normalizeActorRef(item?.warehouseCheckedBy),
        fulfilledAt: item?.fulfilledAt ?? null,
        fulfilledBy: normalizeActorRef(item?.fulfilledBy),
        note: String(item?.note ?? '').trim()
      };
    })
    .filter(Boolean);

  if (!normalized.length) {
    return buildProductItemsFromLines(fallbackProductLines);
  }

  return normalized;
}

export function validateOrderPayload(payload) {
  const orderId = validateRequiredString(payload.orderId, 'orderId');
  const trackingId = validateRequiredString(payload.trackingId, 'trackingId');
  const date = validateRequiredString(payload.date, 'date');
  const source = validateRequiredString(payload.source, 'source');
  const status = validateOrderStatus(payload.status);
  const productLines = validateProductLines(
    payload.productLines ??
      String(payload.product ?? '')
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
  );
  const importSheetType = validateSheetType(payload.importSheetType ?? null);
  const productItems = validateProductItems(payload.productItems, productLines);

  if (!isDisplayDate(date)) {
    throw new Error('date must use dd/mm format.');
  }

  return {
    ...payload,
    orderId,
    trackingId,
    date,
    source,
    status,
    productLines,
    productItems,
    importSheetType
  };
}

export function validateOrderEditPayload(payload) {
  const date = validateRequiredString(payload.date, 'date');
  const trackingId = validateRequiredString(payload.trackingId, 'trackingId');
  const productLines = validateProductLines(
    payload.productLines ??
      String(payload.product ?? '')
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
  );

  if (!isDisplayDate(date)) {
    throw new Error('date must use dd/mm format.');
  }

  return {
    date,
    trackingId,
    productLines
  };
}

export function validateUserProfilePayload(payload) {
  return {
    uid: validateRequiredString(payload.uid, 'uid'),
    email: validateRequiredString(payload.email, 'email'),
    name: validateRequiredString(payload.name, 'name'),
    role: validateRole(payload.role),
    active: validateBoolean(payload.active, 'active')
  };
}

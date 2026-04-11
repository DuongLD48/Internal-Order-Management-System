import { addDoc } from 'firebase/firestore';
import { LOG_ACTIONS } from '../constants/firestore.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { assertPermission } from '../guards/roleGuard.js';
import {
  getOrderLogsCollectionRef,
  createLogsQuery,
  createPrintLogsQuery,
  fetchCollectionRecords,
  fetchQuerySnapshot
} from '../firebase/firestore.js';
import { createAuditActor, createOrderLogRecord, mapQuerySnapshot, normalizeOrderRecord } from '../utils/firestoreMappers.js';
import { createTimestamp } from '../utils/dateFormatter.js';
import { validateRequiredString } from '../utils/validators.js';

export async function appendOrderLog({
  orderId,
  action,
  actor,
  changes = {},
  note = ''
}) {
  assertPermission(actor?.role, PERMISSIONS.LOGS_VIEW);

  const normalizedOrderId = validateRequiredString(orderId, 'orderId');
  const normalizedActor = createAuditActor(actor);
  const createdAt = createTimestamp();

  const payload = createOrderLogRecord({
    action,
    actor: normalizedActor,
    changes,
    note,
    createdAt
  });

  console.info(`[logService] appendOrderLog ${action} for order ${normalizedOrderId}`, payload);

  const docRef = await addDoc(getOrderLogsCollectionRef(normalizedOrderId), payload);

  return {
    id: docRef.id,
    ...payload
  };
}

export async function getOrderLogs(orderId, actor) {
  assertPermission(actor?.role, PERMISSIONS.LOGS_VIEW);

  const normalizedOrderId = validateRequiredString(orderId, 'orderId');
  const queryObject = createLogsQuery(normalizedOrderId);
  return fetchCollectionRecords(queryObject);
}

const LOG_PAGE_SIZE = 100;

function createDayRange(dateValue) {
  const normalized = String(dateValue ?? '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('A valid print date is required.');
  }

  const start = new Date(`${normalized}T00:00:00`);
  const end = new Date(`${normalized}T23:59:59.999`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('A valid print date is required.');
  }

  return {
    startedAt: start.getTime(),
    endedAt: end.getTime()
  };
}

function normalizePrintLogRecord(logRecord) {
  const afterRecord = normalizeOrderRecord(logRecord?.changes?.after ?? {});

  return {
    id: logRecord.id,
    action: logRecord.action,
    createdAt: logRecord.createdAt ?? 0,
    createdBy: logRecord.createdBy ?? null,
    orderId: afterRecord.orderId ?? '',
    trackingId: afterRecord.trackingId ?? '',
    date: afterRecord.date ?? '',
    importSheetType: afterRecord.importSheetType ?? afterRecord.source ?? '-',
    productItems: afterRecord.productItems ?? [],
    productLines: afterRecord.productLines ?? []
  };
}

function normalizeCompletionLogRecord(logRecord) {
  const afterRecord = normalizeOrderRecord(logRecord?.changes?.after ?? {});

  return {
    id: logRecord.id,
    action: logRecord.action,
    createdAt: logRecord.createdAt ?? 0,
    createdBy: logRecord.createdBy ?? null,
    orderId: afterRecord.orderId ?? '',
    trackingId: afterRecord.trackingId ?? '',
    date: afterRecord.date ?? '',
    importSheetType: afterRecord.importSheetType ?? afterRecord.source ?? '-',
    productItems: afterRecord.productItems ?? [],
    productLines: afterRecord.productLines ?? [],
    note: logRecord.note ?? ''
  };
}

export async function getPrintLogsByDate(dateValue, actor) {
  return getPrintLogsPageByDate(dateValue, actor);
}

export async function getPrintLogsPageByDate(dateValue, actor, options = {}) {
  assertPermission(actor?.role, PERMISSIONS.LOGS_VIEW);

  const { startedAt, endedAt } = createDayRange(dateValue);
  const queryObject = createPrintLogsQuery({
    startedAt,
    endedAt,
    limitCount: options.limitCount ?? LOG_PAGE_SIZE,
    cursorSnapshot: options.cursorSnapshot ?? null
  });
  const snapshot = await fetchQuerySnapshot(queryObject);
  const records = mapQuerySnapshot(snapshot);
  const normalizedRecords = records
    .filter((item) => item.action === LOG_ACTIONS.PRINT_ORDER || item.action === LOG_ACTIONS.REPRINT_ORDER)
    .map(normalizePrintLogRecord)
    .filter((item) => item.orderId)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  return {
    records: normalizedRecords,
    cursorSnapshot: snapshot.docs.at(-1) ?? null,
    hasMore: snapshot.docs.length === (options.limitCount ?? LOG_PAGE_SIZE)
  };
}

export async function getCompletionLogsByDate(dateValue, actor) {
  return getCompletionLogsPageByDate(dateValue, actor);
}

export async function getCompletionLogsPageByDate(dateValue, actor, options = {}) {
  assertPermission(actor?.role, PERMISSIONS.LOGS_VIEW);

  const { startedAt, endedAt } = createDayRange(dateValue);
  const queryObject = createPrintLogsQuery({
    startedAt,
    endedAt,
    limitCount: options.limitCount ?? LOG_PAGE_SIZE,
    cursorSnapshot: options.cursorSnapshot ?? null
  });
  const snapshot = await fetchQuerySnapshot(queryObject);
  const records = mapQuerySnapshot(snapshot);
  const normalizedRecords = records
    .filter((item) => item.action === LOG_ACTIONS.COMPLETE_ORDER)
    .map(normalizeCompletionLogRecord)
    .filter((item) => item.orderId)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  return {
    records: normalizedRecords,
    cursorSnapshot: snapshot.docs.at(-1) ?? null,
    hasMore: snapshot.docs.length === (options.limitCount ?? LOG_PAGE_SIZE)
  };
}

export function createSystemLogPayload({ action, changes = {}, note = '' }) {
  if (!Object.values(LOG_ACTIONS).includes(action)) {
    throw new Error('Unsupported log action.');
  }

  return {
    action,
    changes,
    note
  };
}

import { COLLECTIONS, IMPORT_LOCK_TIMEOUT_MS, SYSTEM_LOCK_IDS } from '../constants/firestore.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { assertPermission } from '../guards/roleGuard.js';
import { executeTransaction, fetchDocument, getDocumentRef } from '../firebase/firestore.js';
import { createAuditActor } from '../utils/firestoreMappers.js';
import { createTimestamp } from '../utils/dateFormatter.js';

function normalizeImportLock(record) {
  const timestamp = createTimestamp();
  const expiresAt = record?.expiresAt ?? null;
  const active = Boolean(record?.active) && typeof expiresAt === 'number' && expiresAt > timestamp;

  return {
    id: SYSTEM_LOCK_IDS.ORDER_IMPORT,
    active,
    reason: record?.reason ?? '',
    startedAt: record?.startedAt ?? null,
    expiresAt,
    owner: record?.owner ?? null
  };
}

function getImportLockRef() {
  return getDocumentRef(COLLECTIONS.SYSTEM_LOCKS, SYSTEM_LOCK_IDS.ORDER_IMPORT);
}

export function getImportLockMessage(lockRecord) {
  const lock = normalizeImportLock(lockRecord);

  if (!lock.active) {
    return '';
  }

  return `Import is in progress by ${lock.owner?.email ?? lock.owner?.name ?? 'another user'}. Printing is temporarily locked.`;
}

export async function getImportLock(actor) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_VIEW);
  const record = await fetchDocument(COLLECTIONS.SYSTEM_LOCKS, SYSTEM_LOCK_IDS.ORDER_IMPORT);
  return normalizeImportLock(record);
}

export async function assertImportNotLocked(actor, transaction = null) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_VIEW);

  let record = null;
  if (transaction) {
    const snapshot = await transaction.get(getImportLockRef());
    record = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  } else {
    record = await fetchDocument(COLLECTIONS.SYSTEM_LOCKS, SYSTEM_LOCK_IDS.ORDER_IMPORT);
  }

  const lock = normalizeImportLock(record);

  if (lock.active) {
    throw new Error(getImportLockMessage(lock));
  }

  return lock;
}

export async function acquireImportLock(actor) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_IMPORT);

  const normalizedActor = createAuditActor(actor);
  const startedAt = createTimestamp();
  const expiresAt = startedAt + IMPORT_LOCK_TIMEOUT_MS;

  await executeTransaction(async (transaction) => {
    const lockRef = getImportLockRef();
    const snapshot = await transaction.get(lockRef);
    const current = normalizeImportLock(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);

    if (current.active) {
      throw new Error(getImportLockMessage(current));
    }

    transaction.set(lockRef, {
      active: true,
      reason: 'order-import',
      startedAt,
      expiresAt,
      owner: normalizedActor
    });
  });

  console.info('[systemLockService] acquireImportLock', {
    owner: normalizedActor.email,
    expiresAt
  });

  return {
    active: true,
    reason: 'order-import',
    startedAt,
    expiresAt,
    owner: normalizedActor
  };
}

export async function releaseImportLock(actor) {
  assertPermission(actor?.role, PERMISSIONS.ORDERS_IMPORT);

  const normalizedActor = createAuditActor(actor);
  const releasedAt = createTimestamp();

  await executeTransaction(async (transaction) => {
    const lockRef = getImportLockRef();
    const snapshot = await transaction.get(lockRef);

    if (!snapshot.exists()) {
      return;
    }

    const current = normalizeImportLock({ id: snapshot.id, ...snapshot.data() });

    if (!current.active) {
      transaction.set(
        lockRef,
        {
          active: false,
          reason: '',
          startedAt: null,
          expiresAt: null,
          owner: null,
          releasedAt
        },
        { merge: true }
      );
      return;
    }

    if (current.owner?.uid && current.owner.uid !== normalizedActor.uid) {
      throw new Error(getImportLockMessage(current));
    }

    transaction.set(
      lockRef,
      {
        active: false,
        reason: '',
        startedAt: null,
        expiresAt: null,
        owner: null,
        releasedAt
      },
      { merge: true }
    );
  });

  console.info('[systemLockService] releaseImportLock', {
    owner: normalizedActor.email
  });
}

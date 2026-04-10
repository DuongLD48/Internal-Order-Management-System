import { getDocs, orderBy, query } from 'firebase/firestore';
import { COLLECTIONS } from '../constants/firestore.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { assertPermission, hasPermission } from '../guards/roleGuard.js';
import { getCollectionRef, fetchDocument, writeDocument, patchDocument } from '../firebase/firestore.js';
import { createTimestamp } from '../utils/dateFormatter.js';
import { normalizeUserProfile } from '../utils/firestoreMappers.js';
import {
  validateBoolean,
  validateRole,
  validateUserProfilePayload,
  validateRequiredString
} from '../utils/validators.js';

export async function getCurrentUserProfile(uid) {
  const document = await fetchDocument(COLLECTIONS.USERS, validateRequiredString(uid, 'uid'));
  return normalizeUserProfile(document);
}

export async function getUserProfile(uid, actor) {
  assertPermission(actor?.role, PERMISSIONS.USERS_VIEW);

  const document = await fetchDocument(COLLECTIONS.USERS, validateRequiredString(uid, 'uid'));
  return normalizeUserProfile(document);
}

export async function listUsers(actor) {
  assertPermission(actor?.role, PERMISSIONS.USERS_VIEW);

  const snapshot = await getDocs(query(getCollectionRef(COLLECTIONS.USERS), orderBy('createdAt', 'desc')));

  return snapshot.docs.map((docItem) =>
    normalizeUserProfile({
      id: docItem.id,
      ...docItem.data()
    })
  );
}

export async function upsertUserProfile(payload, actor) {
  assertPermission(actor?.role, PERMISSIONS.USERS_MANAGE);

  const existing = await fetchDocument(COLLECTIONS.USERS, validateRequiredString(payload.uid, 'uid'));
  const canSetRole = hasPermission(actor?.role, PERMISSIONS.USERS_SET_ROLE);
  const normalized = validateUserProfilePayload({
    ...payload,
    role: canSetRole ? payload.role : existing?.role ?? 'viewer'
  });
  const timestamp = createTimestamp();

  const document = {
    ...normalized,
    createdAt: existing?.createdAt ?? payload.createdAt ?? timestamp,
    updatedAt: timestamp
  };

  console.info(`[userService] upsertUserProfile ${document.uid}`, document);

  await writeDocument(COLLECTIONS.USERS, document.uid, document, { merge: true });
  return document;
}

export async function updateUserRole({ uid, role }, actor) {
  assertPermission(actor?.role, PERMISSIONS.USERS_SET_ROLE);

  const normalizedUid = validateRequiredString(uid, 'uid');
  const normalizedRole = validateRole(role);
  const updatedAt = createTimestamp();

  const payload = {
    role: normalizedRole,
    updatedAt
  };

  console.info(`[userService] updateUserRole ${normalizedUid} -> ${normalizedRole}`);

  await patchDocument(COLLECTIONS.USERS, normalizedUid, payload);
  return payload;
}

export async function updateUserActiveState({ uid, active }, actor) {
  assertPermission(actor?.role, PERMISSIONS.USERS_MANAGE);

  const normalizedUid = validateRequiredString(uid, 'uid');
  const normalizedActive = validateBoolean(active, 'active');
  const updatedAt = createTimestamp();

  const payload = {
    active: normalizedActive,
    updatedAt
  };

  console.info(`[userService] updateUserActiveState ${normalizedUid} -> ${normalizedActive}`);

  await patchDocument(COLLECTIONS.USERS, normalizedUid, payload);
  return payload;
}

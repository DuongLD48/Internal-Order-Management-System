import {
  collection,
  collectionGroup,
  documentId,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { getFirebaseServices } from './app.js';
import { COLLECTIONS } from '../constants/firestore.js';
import { mapDocumentSnapshot, mapQuerySnapshot } from '../utils/firestoreMappers.js';

function requireFirestore() {
  const { db, ready } = getFirebaseServices();

  if (!ready || !db) {
    throw new Error('Firestore is not ready. Check Firebase env configuration.');
  }

  return db;
}

export function getCollectionRef(collectionName) {
  return collection(requireFirestore(), collectionName);
}

export function getDocumentRef(collectionName, documentId) {
  return doc(requireFirestore(), collectionName, documentId);
}

export function getOrderRef(orderId) {
  return getDocumentRef(COLLECTIONS.ORDERS, orderId);
}

export function getOrderLogsCollectionRef(orderId) {
  return collection(requireFirestore(), COLLECTIONS.ORDERS, orderId, COLLECTIONS.LOGS);
}

export function getNewOrderLogRef(orderId) {
  return doc(getOrderLogsCollectionRef(orderId));
}

export async function fetchDocument(collectionName, documentId) {
  const snapshot = await getDoc(getDocumentRef(collectionName, documentId));
  return mapDocumentSnapshot(snapshot);
}

export async function fetchCollectionRecords(queryObject) {
  const snapshot = await getDocs(queryObject);
  return mapQuerySnapshot(snapshot);
}

export function subscribeToQuery(queryObject, callback) {
  return onSnapshot(queryObject, (snapshot) => {
    callback(mapQuerySnapshot(snapshot));
  });
}

export function createOrderedQuery(collectionName, constraints = []) {
  return query(getCollectionRef(collectionName), ...constraints);
}

export function createLogsQuery(orderId) {
  return query(getOrderLogsCollectionRef(orderId), orderBy('createdAt', 'desc'));
}

export function createPrintLogsQuery({ startedAt, endedAt }) {
  const constraints = [];

  if (typeof startedAt === 'number') {
    constraints.push(where('createdAt', '>=', startedAt));
  }

  if (typeof endedAt === 'number') {
    constraints.push(where('createdAt', '<=', endedAt));
  }

  return query(collectionGroup(requireFirestore(), COLLECTIONS.LOGS), ...constraints);
}

export function createOrdersByTrackingIdsQuery(trackingIds = []) {
  const normalizedTrackingIds = trackingIds
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);

  if (!normalizedTrackingIds.length) {
    return null;
  }

  return query(
    getCollectionRef(COLLECTIONS.ORDERS),
    where('trackingId', 'in', normalizedTrackingIds)
  );
}

export function createOrdersQuery({ limitCount }) {
  const constraints = [orderBy(documentId(), 'asc')];

  if (limitCount) {
    constraints.push(limit(limitCount));
  }

  return query(getCollectionRef(COLLECTIONS.ORDERS), ...constraints);
}

export async function writeDocument(collectionName, documentId, payload, options = {}) {
  await setDoc(getDocumentRef(collectionName, documentId), payload, options);
}

export async function patchDocument(collectionName, documentId, payload) {
  await updateDoc(getDocumentRef(collectionName, documentId), payload);
}

export function createBatchWriter() {
  return writeBatch(requireFirestore());
}

export async function executeTransaction(transactionHandler) {
  const db = requireFirestore();
  return runTransaction(db, transactionHandler);
}

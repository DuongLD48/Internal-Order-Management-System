import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getFirebaseConfig, validateFirebaseEnv } from './config.js';

let firebaseServices = null;

export function initializeFirebase() {
  if (firebaseServices) {
    return firebaseServices;
  }

  const validation = validateFirebaseEnv();

  if (!validation.isValid) {
    console.warn(
      `Firebase env is incomplete. Missing keys: ${validation.missingKeys.join(', ')}.`
    );

    firebaseServices = {
      app: null,
      auth: null,
      db: null,
      ready: false,
      missingKeys: validation.missingKeys
    };

    return firebaseServices;
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(getFirebaseConfig());
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false
  });

  firebaseServices = {
    app,
    auth,
    db,
    ready: true,
    missingKeys: []
  };

  return firebaseServices;
}

export function getFirebaseServices() {
  if (!firebaseServices) {
    return initializeFirebase();
  }

  return firebaseServices;
}

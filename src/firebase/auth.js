import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { getFirebaseServices } from './app.js';

function mapFirebaseAuthError(error) {
  const code = error?.code ?? 'auth/unknown';

  const messages = {
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/missing-password': 'Please enter your password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Unable to connect. Please check your network.'
  };

  return messages[code] ?? 'Sign in failed. Please try again.';
}

export function toAppUser(user) {
  if (!user) {
    return null;
  }

  return {
    uid: user.uid,
    email: user.email ?? '',
    name: user.displayName ?? user.email ?? 'Unknown User'
  };
}

export function observeAuthState(callback) {
  const { auth, ready } = getFirebaseServices();

  if (!ready || !auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, (user) => {
    callback(toAppUser(user));
  });
}

export async function loginWithEmailPassword({ email, password }) {
  const { auth, ready } = getFirebaseServices();

  if (!ready || !auth) {
    throw new Error('The system is temporarily unavailable. Please try again later.');
  }

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return toAppUser(credential.user);
  } catch (error) {
    throw new Error(mapFirebaseAuthError(error));
  }
}

export async function logoutCurrentUser() {
  const { auth, ready } = getFirebaseServices();

  if (!ready || !auth) {
    return;
  }

  await signOut(auth);
}

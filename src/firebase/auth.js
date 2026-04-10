import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { getFirebaseServices } from './app.js';

function mapFirebaseAuthError(error) {
  const code = error?.code ?? 'auth/unknown';

  const messages = {
    'auth/invalid-credential': 'Email hoac mat khau khong dung.',
    'auth/user-disabled': 'Tai khoan nay da bi vo hieu hoa.',
    'auth/invalid-email': 'Email khong hop le.',
    'auth/missing-password': 'Vui long nhap mat khau.',
    'auth/too-many-requests': 'Co qua nhieu lan thu dang nhap. Vui long thu lai sau.',
    'auth/network-request-failed': 'Khong the ket noi toi Firebase. Vui long kiem tra mang.'
  };

  return messages[code] ?? 'Dang nhap that bai. Vui long thu lai.';
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
    throw new Error('Firebase Authentication chua san sang. Kiem tra lai file .env.');
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

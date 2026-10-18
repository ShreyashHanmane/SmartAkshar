import {
  type User,
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  linkWithPopup,
  onIdTokenChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';
import { getFirebase } from './firebase';

/** The app's view of the signed-in person. UI code never sees the Firebase User object. */
export interface SessionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isGuest: boolean;
  emailVerified: boolean;
  /** True for password accounts that still need to verify their email. */
  needsVerification: boolean;
  providers: string[];
}

export function toSessionUser(user: User): SessionUser {
  const providers = user.providerData.map((p) => p.providerId);
  const isGuest = user.isAnonymous;
  const passwordOnly = providers.length > 0 && providers.every((p) => p === 'password');
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    isGuest,
    emailVerified: user.emailVerified,
    needsVerification: !isGuest && passwordOnly && !user.emailVerified,
    providers,
  };
}

/**
 * Uses onIdTokenChanged rather than onAuthStateChanged: it also fires when a guest
 * is upgraded in place (same uid) and after profile/verification refreshes.
 */
export function observeSession(callback: (user: SessionUser | null) => void): () => void {
  return onIdTokenChanged(getFirebase().auth, (user) => callback(user ? toSessionUser(user) : null));
}

function currentUser(): User | null {
  return getFirebase().auth.currentUser;
}

function verificationSettings() {
  return { url: `${window.location.origin}/verify-email`, handleCodeInApp: false };
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(getFirebase().auth, email, password);
}

/**
 * Creates a password account. When a guest is signed in, the guest account is
 * upgraded in place (same uid), so all guest data is kept.
 */
export async function signUpWithEmail(name: string, email: string, password: string): Promise<void> {
  const { auth } = getFirebase();
  const guest = currentUser();
  const user =
    guest?.isAnonymous === true
      ? (await linkWithCredential(guest, EmailAuthProvider.credential(email, password))).user
      : (await createUserWithEmailAndPassword(auth, email, password)).user;
  await updateProfile(user, { displayName: name });
  await sendEmailVerification(user, verificationSettings());
  await reload(user);
  // Fresh token so session listeners see the new name and provider.
  await user.getIdToken(true);
}

/** Google sign-in. A signed-in guest is upgraded in place (same uid). */
export async function signInWithGoogle(): Promise<void> {
  const { auth } = getFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const guest = currentUser();
  if (guest?.isAnonymous) {
    const { user } = await linkWithPopup(guest, provider);
    await reload(user);
    await user.getIdToken(true);
    return;
  }
  await signInWithPopup(auth, provider);
}

export async function continueAsGuest(): Promise<void> {
  await signInAnonymously(getFirebase().auth);
}

export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getFirebase().auth, email, { url: `${window.location.origin}/login` });
  } catch (error) {
    // Never reveal whether an account exists for this email.
    if (authErrorCode(error) === 'auth/user-not-found') return;
    throw error;
  }
}

export async function resendVerificationEmail(): Promise<void> {
  const user = currentUser();
  if (!user) throw new Error('Not signed in');
  await sendEmailVerification(user, verificationSettings());
}

/** Reloads the user from the server and returns the fresh session (e.g. after verifying email). */
export async function refreshSession(): Promise<SessionUser | null> {
  const user = currentUser();
  if (!user) return null;
  await reload(user);
  await user.getIdToken(true);
  return toSessionUser(user);
}

export const LOCAL_KEY_PREFIX = 'akshar:';

/**
 * Signs out and removes everything this device cached for the user, so a shared
 * device does not leak data: Firestore offline cache, Cache Storage, and app keys
 * in localStorage/sessionStorage. Callers should then do a full page navigation.
 */
export async function signOutAndClear(): Promise<void> {
  const { auth, db } = getFirebase();
  await signOut(auth);
  await terminate(db).catch(() => undefined);
  await clearIndexedDbPersistence(db).catch(() => undefined);
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (key.startsWith(LOCAL_KEY_PREFIX)) storage.removeItem(key);
    }
  }
}

export function authErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

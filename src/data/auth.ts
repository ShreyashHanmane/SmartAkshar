import {
  type User,
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  linkWithCredential,
  linkWithPopup,
  onIdTokenChanged,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { ApiError } from './api';
import { getFirebase } from './firebase';

export const LOCAL_KEY_PREFIX = 'akshar:';

/** The app's view of the signed-in person. UI code never sees the raw Firebase User object. */
export interface SessionUser {
  uid: string;
  email: string | null;
  displayName: string;
  photoURL: string | null;
  isGuest: boolean;
  emailVerified: boolean;
  /** True for password accounts that still need to verify their email. */
  needsVerification: boolean;
  providers: string[];
  /** UI compatibility aliases */
  username: string;
  avatarUrl: string | null;
}

export function toSessionUser(user: User): SessionUser {
  const providers = user.providerData.map((p) => p.providerId);
  const isGuest = user.isAnonymous;
  const passwordOnly = providers.length > 0 && providers.every((p) => p === 'password');
  const storedAvatar =
    typeof window !== 'undefined'
      ? window.localStorage.getItem(`${LOCAL_KEY_PREFIX}avatar:${user.uid}`)
      : null;
  const photo = storedAvatar ?? user.photoURL ?? null;
  const fallbackName = user.email ? (user.email.split('@')[0] ?? 'User') : 'Guest';
  const displayName = user.displayName?.trim() || fallbackName;

  return {
    uid: user.uid,
    email: user.email,
    displayName,
    photoURL: photo,
    isGuest,
    emailVerified: user.emailVerified,
    needsVerification: !isGuest && passwordOnly && !user.emailVerified,
    providers,
    username: user.email ? (user.email.split('@')[0] ?? fallbackName) : fallbackName,
    avatarUrl: photo,
  };
}

let currentSession: SessionUser | null | undefined;
const listeners = new Set<(user: SessionUser | null) => void>();

function publish(user: SessionUser | null) {
  currentSession = user;
  for (const listener of listeners) {
    listener(user);
  }
}

/**
 * Uses onIdTokenChanged: it fires when signed in, signed out, when a guest
 * is upgraded in place (same uid), and after profile/verification refreshes.
 */
export function observeSession(callback: (user: SessionUser | null) => void): () => void {
  listeners.add(callback);
  if (currentSession !== undefined) {
    callback(currentSession);
  }

  const unsubscribe = onIdTokenChanged(getFirebase().auth, (user) => {
    publish(user ? toSessionUser(user) : null);
  });

  return () => {
    listeners.delete(callback);
    unsubscribe();
  };
}

export function watchAccount(): () => void {
  // Firebase onIdTokenChanged notifies across tabs automatically.
  return () => undefined;
}

function currentUser(): User | null {
  return getFirebase().auth.currentUser;
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const res = await signInWithEmailAndPassword(getFirebase().auth, email, password);
  publish(toSessionUser(res.user));
}

export async function signUpWithEmail(name: string, email: string, password: string): Promise<void> {
  const { auth } = getFirebase();
  const guest = currentUser();
  const user =
    guest?.isAnonymous === true
      ? (await linkWithCredential(guest, EmailAuthProvider.credential(email, password))).user
      : (await createUserWithEmailAndPassword(auth, email, password)).user;
  await updateProfile(user, { displayName: name });
  try {
    await sendEmailVerification(user);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Could not send verification email:', err);
  }
  await reload(user).catch(() => undefined);
  await user.getIdToken(true).catch(() => undefined);
  publish(toSessionUser(user));
}

/** Google sign-in. A signed-in guest is upgraded in place (same uid). */
export async function signInWithGoogle(): Promise<void> {
  const { auth } = getFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const guest = currentUser();
  if (guest?.isAnonymous) {
    const { user } = await linkWithPopup(guest, provider);
    await reload(user).catch(() => undefined);
    await user.getIdToken(true).catch(() => undefined);
    publish(toSessionUser(user));
    return;
  }
  const res = await signInWithPopup(auth, provider);
  publish(toSessionUser(res.user));
}

export async function continueAsGuest(): Promise<void> {
  const res = await signInAnonymously(getFirebase().auth);
  publish(toSessionUser(res.user));
}

export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getFirebase().auth, email);
  } catch (error) {
    // Never reveal whether an account exists for this email.
    if (authErrorCode(error) === 'auth/user-not-found') return;
    throw error;
  }
}

export async function resendVerificationEmail(): Promise<void> {
  const user = currentUser();
  if (!user) throw new Error('Not signed in');
  await sendEmailVerification(user);
}

/** Reloads the user from Firebase and returns the fresh session (e.g. after verifying email). */
export async function refreshSession(): Promise<SessionUser | null> {
  const user = currentUser();
  if (!user) return null;
  await reload(user);
  await user.getIdToken(true);
  const session = toSessionUser(user);
  publish(session);
  return session;
}

export async function updateDisplayName(displayName: string): Promise<void> {
  const user = currentUser();
  if (!user) throw new Error('Not signed in');
  await updateProfile(user, { displayName });
  await reload(user);
  await user.getIdToken(true);
  publish(toSessionUser(user));
}

export async function uploadAvatar(file: Blob, _ext: 'png' | 'jpg'): Promise<void> {
  const user = currentUser();
  if (!user) throw new Error('Not signed in');

  const reader = new FileReader();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(`${LOCAL_KEY_PREFIX}avatar:${user.uid}`, dataUrl);
  }

  // Update profile photo if within size limit
  if (dataUrl.length <= 2048) {
    await updateProfile(user, { photoURL: dataUrl }).catch(() => undefined);
  }
  publish(toSessionUser(user));
}

export async function removeAvatar(): Promise<void> {
  const user = currentUser();
  if (!user) throw new Error('Not signed in');
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(`${LOCAL_KEY_PREFIX}avatar:${user.uid}`);
  }
  await updateProfile(user, { photoURL: null }).catch(() => undefined);
  publish(toSessionUser(user));
}

export async function changePassword(current: string, next: string): Promise<void> {
  const user = currentUser();
  if (!user || !user.email) throw new Error('Not signed in');
  const cred = EmailAuthProvider.credential(user.email, current);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, next);
}

export async function deleteAccount(password: string): Promise<void> {
  const user = currentUser();
  if (!user) throw new Error('Not signed in');
  if (user.email && password) {
    const cred = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, cred);
  }
  await deleteUser(user);
  await signOutAndClear();
}

/**
 * Signs out and removes everything this device cached for the user, so a shared
 * device does not leak data. Callers should then do a full page navigation.
 */
export async function signOutAndClear(): Promise<void> {
  const { auth } = getFirebase();
  await signOut(auth);
  if (typeof window !== 'undefined') {
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
  publish(null);
}

export function authErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** Backward-compatibility aliases for local server callers */
export const signIn = signInWithEmail;
export async function signUp(name: string, emailOrUsername: string, password: string): Promise<void> {
  const email = emailOrUsername.includes('@') ? emailOrUsername : `${emailOrUsername}@example.com`;
  await signUpWithEmail(name, email, password);
}

export { ApiError };

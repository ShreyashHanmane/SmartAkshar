import { type User, userSchema } from '../shared/schemas';
import { ApiError, apiErrorCode, request, send } from './api';
import { closeEvents, live } from './events';

/** The app's view of the signed-in person. */
export interface SessionUser {
  uid: string;
  username: string;
  displayName: string;
  /** The user's own profile photo (served only to them), or null. */
  avatarUrl: string | null;
}

const toSession = (u: User): SessionUser => ({
  uid: u.id,
  username: u.username,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl,
});

let current: SessionUser | null | undefined;
const listeners = new Set<(u: SessionUser | null) => void>();

function publish(user: SessionUser | null) {
  current = user;
  for (const l of listeners) l(user);
}

async function readUser(res: Response): Promise<SessionUser | null> {
  const body = (await res.json()) as { user: unknown };
  return body.user ? toSession(userSchema.parse(body.user)) : null;
}

/**
 * Calls back with the session (null when signed out). The first answer comes
 * from the server; if the server can't be reached it retries until it can.
 */
export function observeSession(callback: (user: SessionUser | null) => void): () => void {
  listeners.add(callback);
  if (current !== undefined) callback(current);
  else void loadSession();
  return () => listeners.delete(callback);
}

let loading: Promise<void> | null = null;
function loadSession(): Promise<void> {
  loading ??= (async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        publish(await readUser(await request('GET', '/api/auth/me')));
        return;
      } catch {
        await new Promise((r) => setTimeout(r, Math.min(5000, 500 * 2 ** attempt)));
      }
    }
  })().finally(() => {
    loading = null;
  });
  return loading;
}

export async function signIn(username: string, password: string): Promise<void> {
  publish(await readUser(await request('POST', '/api/auth/login', { json: { username, password } })));
}

export async function signUp(name: string, username: string, password: string): Promise<void> {
  publish(await readUser(await request('POST', '/api/auth/signup', { json: { name, username, password } })));
}

export async function changePassword(current: string, next: string): Promise<void> {
  await send('POST', '/api/auth/password', { current, next });
}

export async function updateDisplayName(displayName: string): Promise<void> {
  publish(await readUser(await request('PATCH', '/api/account', { json: { displayName } })));
}

/** Uploads a profile photo (the app sends a small square PNG or JPEG). */
export async function uploadAvatar(file: Blob, ext: 'png' | 'jpg'): Promise<void> {
  publish(
    await readUser(
      await request('POST', '/api/account/avatar', {
        body: file,
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': `photo.${ext}` },
      }),
    ),
  );
}

export async function removeAvatar(): Promise<void> {
  publish(await readUser(await request('DELETE', '/api/account/avatar')));
}

/** Keeps the session's name and photo current when they change in another tab. */
export function watchAccount(): () => void {
  return live(
    async () => readUser(await request('GET', '/api/auth/me')),
    ['account'],
    (user) => {
      if (user && current && user.uid === current.uid) publish(user);
    },
    () => undefined,
  );
}

export async function deleteAccount(password: string): Promise<void> {
  await send('POST', '/api/account/delete', { password });
  await clearLocalData();
  publish(null);
}

export const LOCAL_KEY_PREFIX = 'akshar:';

async function clearLocalData() {
  closeEvents();
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of Object.keys(storage)) if (key.startsWith(LOCAL_KEY_PREFIX)) storage.removeItem(key);
  }
}

/**
 * Signs out and removes everything this browser cached for the user (Cache
 * Storage, app keys in local/session storage), so a shared computer doesn't
 * leak data. Callers then do a full page navigation.
 */
export async function signOutAndClear(): Promise<void> {
  try {
    await send('POST', '/api/auth/logout');
  } finally {
    await clearLocalData();
    publish(null);
  }
}

export function authErrorCode(error: unknown): string | undefined {
  return apiErrorCode(error);
}

export { ApiError };

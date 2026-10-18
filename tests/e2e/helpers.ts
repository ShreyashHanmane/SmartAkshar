import { type Page, expect } from '@playwright/test';

const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const PROJECT = 'demo-akshar';

export function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

interface OobCode {
  email: string;
  requestType: 'VERIFY_EMAIL' | 'PASSWORD_RESET' | string;
  oobLink: string;
}

/** Emails the Auth emulator "sent" (the emulator exposes them instead of mailing). */
export async function oobCodes(email: string): Promise<OobCode[]> {
  const res = await fetch(`${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const body = (await res.json()) as { oobCodes: OobCode[] };
  return body.oobCodes.filter((c) => c.email === email);
}

export async function verifyEmailViaEmulator(email: string): Promise<void> {
  await expect
    .poll(async () => (await oobCodes(email)).some((c) => c.requestType === 'VERIFY_EMAIL'))
    .toBe(true);
  const code = (await oobCodes(email)).filter((c) => c.requestType === 'VERIFY_EMAIL').at(-1);
  if (!code) throw new Error('no verification email');
  const res = await fetch(code.oobLink);
  expect(res.ok).toBe(true);
}

/** Reads the signed-in uid from Firebase's own persistence (IndexedDB) in the page. */
export async function storedUid(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const open = indexedDB.open('firebaseLocalStorageDb');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve(null);
          const all = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
          all.onsuccess = () => {
            const row = (all.result as { value?: { uid?: string } }[]).find((r) => r.value?.uid);
            resolve(row?.value?.uid ?? null);
          };
          all.onerror = () => resolve(null);
        };
      }),
  );
}

export async function signUp(page: Page, name: string, email: string, password: string): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/verify-email$/);
}

export async function signUpVerified(
  page: Page,
  name: string,
  email: string,
  password: string,
): Promise<void> {
  await signUp(page, name, email, password);
  await verifyEmailViaEmulator(email);
  await page.getByRole('button', { name: "I've verified my email" }).click();
  await expect(greeting(page, name)).toBeVisible();
}

/** The dashboard greeting ("Good afternoon, Asha"). */
export function greeting(page: Page, name: string) {
  return page.getByRole('heading', {
    level: 1,
    name: new RegExp(`^Good (morning|afternoon|evening), ${name}$`),
  });
}

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

export async function signInAsGuest(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await expect(page).toHaveURL(/\/$/);
}

export function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1024) < 768;
}

/** Opens the navigation (the drawer on mobile; the sidebar is always visible on larger screens). */
export async function openNav(page: Page): Promise<void> {
  if (isMobile(page)) await page.getByRole('button', { name: 'Open menu' }).click();
}

export function nav(page: Page) {
  return isMobile(page) ? page.getByRole('dialog', { name: 'Main navigation' }) : page.locator('aside');
}

/** Sign-out lives in Settings. Guests are asked to confirm. */
export async function signOutViaSettings(page: Page, { guest = false } = {}): Promise<void> {
  await page.goto('/settings');
  await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
  if (guest) await page.getByRole('button', { name: 'Sign out and discard' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

type FsValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values: FsValue[] } }
  | { mapValue: { fields: Record<string, FsValue> } };

function toFs(value: unknown): FsValue {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number')
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFs) } };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toFs(v)]),
      ),
    },
  };
}

/**
 * Writes a document straight into the Firestore emulator (admin bypass, test data only).
 * Used to seed data the UI under test does not create itself.
 */
export async function seedDoc(path: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(
    `http://127.0.0.1:8080/v1/projects/demo-akshar/databases/(default)/documents/${path}`,
    {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: (toFs(data) as { mapValue: { fields: Record<string, FsValue> } }).mapValue.fields,
      }),
    },
  );
  if (!res.ok) throw new Error(`seed ${path} failed: ${res.status} ${await res.text()}`);
}

export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Packs points the same way the app does (Int16 deltas, base64). */
export function packPoints(points: [number, number][]): string {
  const buf = Buffer.alloc(points.length * 6);
  let px = 0;
  let py = 0;
  points.forEach(([x, y], i) => {
    buf.writeInt16LE(i === 0 ? x : x - px, i * 6);
    buf.writeInt16LE(i === 0 ? y : y - py, i * 6 + 2);
    buf.writeInt16LE(1000, i * 6 + 4);
    px = x;
    py = y;
  });
  return buf.toString('base64');
}

export async function createNotebookViaUi(page: Page, title: string, subject?: string): Promise<string> {
  const dialogOpeners = page.getByRole('button', { name: /^(New notebook|Create notebook)/ });
  await dialogOpeners.first().click();
  const dialog = page.getByRole('dialog', { name: 'New notebook' });
  await dialog.getByLabel('Title').fill(title);
  if (subject) await dialog.getByLabel('Subject').selectOption({ label: subject });
  await dialog.getByRole('button', { name: 'Create notebook' }).click();
  await expect(page).toHaveURL(/\/notebooks\/[A-Za-z0-9]+$/);
  const id = page.url().split('/').pop() as string;
  const uid = await storedUid(page);
  await waitForServerDoc(`users/${uid}/notebooks/${id}`);
  return id;
}

export async function addSubjectViaUi(page: Page, name: string): Promise<void> {
  await openNav(page);
  const n = nav(page);
  await n.getByRole('button', { name: 'Add subject' }).click();
  await page.getByLabel('Subject name').fill(name);
  await page.getByRole('button', { name: 'Create subject' }).click();
  await expect(n.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
  if (isMobile(page)) await page.getByRole('button', { name: 'Close menu' }).click();
}

/** Reads a document from the Firestore emulator (admin bypass) as plain JSON-ish values. */
export async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `http://127.0.0.1:8080/v1/projects/demo-akshar/databases/(default)/documents/${path}`,
    {
      headers: { Authorization: 'Bearer owner' },
    },
  );
  if (res.status === 404) return null;
  const body = (await res.json()) as { fields?: Record<string, FsValue> };
  const fromFs = (v: FsValue): unknown => {
    if ('mapValue' in v)
      return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromFs(x)]));
    if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromFs);
    if ('integerValue' in v) return Number(v.integerValue);
    if ('nullValue' in v) return null;
    return Object.values(v)[0];
  };
  return Object.fromEntries(Object.entries(body.fields ?? {}).map(([k, v]) => [k, fromFs(v)]));
}

/** Waits until a document exists on the server (so a full reload can't race the sync). */
export async function waitForServerDoc(
  path: string,
  check: (d: Record<string, unknown>) => boolean = () => true,
) {
  await expect
    .poll(async () => {
      const d = await readDoc(path);
      return d !== null && check(d);
    })
    .toBe(true);
}

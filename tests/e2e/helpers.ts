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
  await expect(page.getByRole('heading', { name: `Signed in as ${name}` })).toBeVisible();
}

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

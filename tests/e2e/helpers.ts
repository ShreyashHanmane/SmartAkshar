import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { type Page, expect } from '@playwright/test';

export const PASSWORD = 'study1234';

export function uniqueName(tag: string): string {
  return `${tag}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** The dashboard greeting ("Good afternoon, Asha"). */
export function greeting(page: Page, name: string) {
  return page.getByRole('heading', {
    level: 1,
    name: new RegExp(`^Good (morning|afternoon|evening), ${name}$`),
  });
}

export async function signUpViaUi(page: Page, name: string, username: string, password = PASSWORD) {
  await page.goto('/signup');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(greeting(page, name)).toBeVisible();
}

export async function signInViaUi(page: Page, username: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** Creates a fresh account through the API (fast), signs this browser in, and opens the dashboard. */
export async function signUpFresh(page: Page, name = 'Asha'): Promise<string> {
  const username = uniqueName('u');
  const res = await page.request.post('/api/auth/signup', {
    headers: { 'X-Akshar': '1' },
    // Tests start from an empty account; starter content has its own tests.
    data: { name, username, password: PASSWORD, starter: false },
  });
  expect(res.status()).toBe(201);
  await page.goto('/');
  await expect(greeting(page, name)).toBeVisible();
  return username;
}

/** Sign-out lives in Settings. */
export async function signOutViaSettings(page: Page) {
  await page.goto('/settings');
  await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

export async function myId(page: Page): Promise<string> {
  const body = (await (await page.request.get('/api/auth/me')).json()) as { user: { id: string } | null };
  return body.user?.id ?? '';
}

export async function apiGet<T = unknown>(page: Page, path: string): Promise<T | null> {
  const res = await page.request.get(path);
  return res.status() === 404 ? null : ((await res.json()) as T);
}

export async function apiSend(
  page: Page,
  method: 'PUT' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
) {
  const res = await page.request.fetch(path, {
    method,
    headers: { 'X-Akshar': '1' },
    ...(data === undefined ? {} : { data }),
  });
  expect(res.ok(), `${method} ${path} -> ${res.status()}`).toBe(true);
}

/** Writes straight into the e2e database (test data only, e.g. past study time). */
export function dbRun(sql: string, ...params: (string | number | null)[]) {
  const db = new DatabaseSync(resolve('.tmp-test/e2e/akshar.db'));
  try {
    db.exec('PRAGMA busy_timeout = 3000');
    db.prepare(sql).run(...params);
  } finally {
    db.close();
  }
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

export async function createNotebookViaUi(page: Page, title: string, subject?: string): Promise<string> {
  await page
    .getByRole('button', { name: /^(New notebook|Create notebook)/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'New notebook' });
  await dialog.getByLabel('Title').fill(title);
  if (subject) await dialog.getByLabel('Subject').selectOption({ label: subject });
  await dialog.getByRole('button', { name: 'Create notebook' }).click();
  await expect(page).toHaveURL(/\/notebooks\/[A-Za-z0-9_-]+$/);
  const id = page.url().split('/').pop() as string;
  await expect.poll(async () => (await apiGet(page, `/api/notebooks/${id}`)) !== null).toBe(true);
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

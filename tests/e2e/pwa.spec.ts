import { type Page, expect, test } from '@playwright/test';
import { greeting, signOutViaSettings, signUpFresh } from './helpers';

/** Every URL in every Cache Storage cache this page can see. */
const cachedUrls = (page: Page) =>
  page.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys())
      for (const req of await (await caches.open(key)).keys()) urls.push(new URL(req.url).pathname);
    return urls;
  });

const swReady = (page: Page) =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) =>
        navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }),
      );
    return reg.active?.scriptURL ?? '';
  });

test('installable: manifest and icons', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  const res = await page.request.get('/manifest.webmanifest');
  expect(res.headers()['content-type']).toBe('application/manifest+json');
  const manifest = (await res.json()) as {
    name: string;
    display: string;
    start_url: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };
  expect(manifest).toMatchObject({
    name: 'AKSHAR — Smart Study Space',
    display: 'standalone',
    start_url: '/',
  });
  for (const icon of manifest.icons) {
    const png = await page.request.get(icon.src);
    expect(png.headers()['content-type']).toBe('image/png');
    const bytes = await png.body();
    const size = `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
    expect(size).toBe(icon.sizes);
  }
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
});

test('opens while the server is unreachable, recovers when it is back, and never caches user data', async ({
  page,
  context,
}) => {
  await signUpFresh(page);
  expect(await swReady(page)).toMatch(/\/sw\.js$/);
  // Use the app a little so data requests happen while the worker is in control.
  await page.goto('/flashcards');
  await page.goto('/settings');
  await expect(page.getByText('All changes saved')).toBeVisible();

  const urls = await cachedUrls(page);
  expect(urls).toContain('/index.html');
  expect(urls.some((u) => u.startsWith('/assets/'))).toBe(true);
  expect(urls.filter((u) => u.startsWith('/api/'))).toEqual([]);

  await context.setOffline(true);
  await page.reload();
  // The app shell comes from the cache and explains what's wrong.
  await expect(page.getByRole('alert').filter({ hasText: "Can't reach the AKSHAR server" })).toBeVisible();

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('signing out clears cached files', async ({ page }) => {
  await signUpFresh(page);
  await swReady(page);
  await page.goto('/settings');
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect((await cachedUrls(page)).length).toBeGreaterThan(0);
  await signOutViaSettings(page);
  // Only the public login page may have been cached again since.
  const after = await cachedUrls(page);
  expect(
    after.filter((u) => u !== '/index.html' && !u.startsWith('/assets/') && !u.startsWith('/icons/')),
  ).toEqual([]);
  expect(after.filter((u) => u.startsWith('/api/'))).toEqual([]);
  await expect(page).toHaveURL(/\/login$/);
  await expect(greeting(page, 'Asha')).toHaveCount(0);
});

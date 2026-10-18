import { expect, test } from '@playwright/test';

test('app loads with the light theme, wordmark, and no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');

  await expect(page.getByText('AKSHAR', { exact: true })).toBeVisible();
  await expect(page.getByText('Smart Study Space')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'md');

  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bodyBg).toBe('rgb(245, 251, 255)');

  const fontLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "Noto Sans"');
  });
  expect(fontLoaded).toBe(true);

  expect(errors).toEqual([]);
});

for (const [theme, canvas] of [
  ['dark', 'rgb(11, 23, 38)'],
  ['paper', 'rgb(244, 236, 220)'],
] as const) {
  test(`${theme} theme tokens apply`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((name) => (document.documentElement.dataset.theme = name), theme);
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe(canvas);
  });
}

test('unknown routes show the not-found page with a way back', async ({ page }) => {
  await page.goto('/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to the start page' }).click();
  await expect(page).toHaveURL('/');
});

test('layout has no horizontal overflow', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

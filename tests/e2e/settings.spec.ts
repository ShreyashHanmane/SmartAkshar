import { type Page, expect, test } from '@playwright/test';
import { PASSWORD, apiGet, greeting, signInViaUi, signUpFresh } from './helpers';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let username = '';
test.beforeEach(async ({ page }) => {
  username = await signUpFresh(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
});

const main = (page: Page) => page.getByRole('main');

test('profile: name, read-only username, and photo upload / remove', async ({ page }) => {
  const name = main(page).getByLabel('Name', { exact: true });
  await expect(name).toHaveValue('Asha');
  await expect(main(page).getByLabel('Username')).toHaveValue(username);
  await expect(main(page).getByLabel('Username')).toHaveAttribute('readonly', '');

  await name.fill('');
  await name.press('Enter');
  await expect(main(page).getByText('Enter your name.')).toBeVisible();
  await name.fill('Asha Rao');
  await name.press('Enter');
  await expect(page.getByText('Name saved.')).toBeVisible();
  await expect
    .poll(
      async () => (await apiGet<{ user: { displayName: string } }>(page, '/api/auth/me'))?.user.displayName,
    )
    .toBe('Asha Rao');

  // Photo: picked file is cropped/resized in the browser and uploaded.
  await main(page)
    .locator('input[type="file"]')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG_1PX });
  await expect(page.getByText('Photo updated.')).toBeVisible();
  const img = main(page).locator('img[src^="/api/files/images/"]');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(256);

  await main(page).getByRole('button', { name: 'Remove photo' }).click();
  await expect(page.getByText('Photo removed.')).toBeVisible();
  await expect(img).toHaveCount(0);

  await main(page)
    .locator('input[type="file"]')
    .setInputFiles({ name: 'evil.png', mimeType: 'image/png', buffer: Buffer.from('<svg/>') });
  await expect(page.getByText('Choose a PNG, JPEG or WebP image.')).toBeVisible();

  await page.goto('/');
  await expect(greeting(page, 'Asha Rao')).toBeVisible();
});

test('change password: validation, wrong current password, then success', async ({ page }) => {
  await main(page).getByRole('button', { name: 'Change password' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change password' });
  await dialog.getByLabel('Current password').fill('wrongpass1');
  await dialog.getByLabel('New password', { exact: true }).fill('newpass99');
  await dialog.getByLabel('Confirm new password').fill('newpass98');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(dialog.getByText("The passwords don't match.")).toBeVisible();

  await dialog.getByLabel('Confirm new password').fill('newpass99');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(dialog.getByText("That password isn't right.")).toBeVisible();

  await dialog.getByLabel('Current password').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed. Other devices have been signed out.')).toBeVisible();
  await expect(dialog).toBeHidden();

  await main(page).getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signInViaUi(page, username, 'newpass99');
  await expect(greeting(page, 'Asha')).toBeVisible();
});

test('data: real storage numbers and sync status', async ({ page }) => {
  const storage = main(page).getByText(/of 200\.0 MB used/);
  await expect(storage).toHaveText('0 B of 200.0 MB used');
  await expect(main(page).getByText('Books: 0 (0 B) · Images: 0 (0 B)')).toBeVisible();
  await expect(main(page).getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await expect(main(page).getByText('Connected to the AKSHAR server on this computer.')).toBeVisible();

  await main(page)
    .locator('input[type="file"]')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG_1PX });
  await expect(page.getByText('Photo updated.')).toBeVisible();
  await expect(storage).toHaveText(/^\d+ (B|KB) of 200\.0 MB used$/);
  await expect(storage).not.toHaveText('0 B of 200.0 MB used');
  await expect(main(page).getByText(/Images: 1 \(/)).toBeVisible();
});

test('delete account: needs the password, then everything is gone', async ({ page }) => {
  await main(page).getByRole('button', { name: 'Delete account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
  await expect(dialog).toContainText("This can't be undone");
  await dialog.getByLabel('Current password').fill('wrongpass1');
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(dialog.getByText("That password isn't right.")).toBeVisible();

  await dialog.getByLabel('Current password').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Username or password is incorrect.')).toBeVisible();
});

import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  apiGet,
  greeting,
  signInViaUi,
  signOutViaSettings,
  signUpFresh,
  signUpViaUi,
  uniqueName,
} from './helpers';

test('protected pages send signed-out visitors to sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('sign up, stay signed in, sign out (clearing local data), and sign back in', async ({ page }) => {
  const username = uniqueName('asha');
  await signUpViaUi(page, 'Asha', username);
  await page.reload();
  await expect(greeting(page, 'Asha')).toBeVisible();

  await page.evaluate(() => localStorage.setItem('akshar:test', 'cached'));
  await signOutViaSettings(page);
  expect(await page.evaluate(() => localStorage.getItem('akshar:test'))).toBeNull();
  expect(await apiGet(page, '/api/auth/me')).toEqual({ user: null });

  await signInViaUi(page, username.toUpperCase());
  await expect(greeting(page, 'Asha')).toBeVisible();
});

test('wrong credentials show one generic error', async ({ page }) => {
  const username = await signUpFresh(page, 'Ravi');
  await signOutViaSettings(page);
  await signInViaUi(page, username, 'not-the-password1');
  await expect(page.getByRole('alert')).toHaveText('Username or password is incorrect.');
  await signInViaUi(page, uniqueName('nobody'));
  await expect(page.getByRole('alert')).toHaveText('Username or password is incorrect.');
});

test('sign-up validation and taken usernames', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Username').fill('a b');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter your name.')).toBeVisible();
  await expect(page.getByText('Use only letters, numbers, dots, dashes or underscores.')).toBeVisible();
  await expect(page.getByText('Use 8 to 128 characters.')).toBeVisible();

  const taken = uniqueName('taken');
  await page.request.post('/api/auth/signup', {
    headers: { 'X-Akshar': '1' },
    data: { name: 'T', username: taken, password: PASSWORD },
  });
  await page.context().clearCookies();
  await page.goto('/signup');
  await page.getByLabel('Name', { exact: true }).fill('Other');
  await page.getByLabel('Username').fill(taken);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'That username is taken on this computer. Choose another.',
  );
});

test('forgot password explains the local reset command', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('asha');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByText('npm run reset-password -- asha')).toBeVisible();
});

test("one student can't see another student's notebooks", async ({ browser }) => {
  const a = await browser.newPage();
  await signUpFresh(a, 'Alice');
  await a.getByRole('button', { name: /^Create notebook/ }).click();
  await a.getByRole('dialog', { name: 'New notebook' }).getByLabel('Title').fill('Private diary');
  await a.getByRole('dialog').getByRole('button', { name: 'Create notebook' }).click();
  await expect(a).toHaveURL(/\/notebooks\/.+/);
  const url = a.url();

  const b = await browser.newPage();
  await signUpFresh(b, 'Bob');
  await expect(b.getByText('Private diary')).toHaveCount(0);
  await b.goto(new URL(url).pathname);
  await expect(b.getByRole('heading', { name: "This notebook doesn't exist or was deleted." })).toBeVisible();
});

test('explains how to start the server when it is unreachable', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toHaveText("Can't reach the AKSHAR server");
  await expect(page.getByText('npm start')).toBeVisible();
  await page.unroute('**/api/**');
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('signed-in users skip the sign-in page', async ({ page }) => {
  await signUpFresh(page);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/$/);
});

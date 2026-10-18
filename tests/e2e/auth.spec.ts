import { expect, test } from '@playwright/test';
import {
  confirmVerified,
  greeting,
  oobCodes,
  signOutViaSettings,
  signIn,
  signUp,
  signUpVerified,
  storedUid,
  uniqueEmail,
  verifyEmailViaEmulator,
} from './helpers';

const PASSWORD = 'study1234';

test('protected pages send signed-out visitors to sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('sign up, verify email, sign out, and sign back in', async ({ page }) => {
  const email = uniqueEmail('signup');
  await signUp(page, 'Asha', email, PASSWORD);

  // Unverified accounts cannot reach the app.
  await page.goto('/');
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.getByRole('button', { name: "I've verified my email" }).click();
  await expect(page.getByRole('alert')).toContainText("isn't verified yet");

  await verifyEmailViaEmulator(email);
  await page.getByRole('button', { name: "I've verified my email" }).click();
  await expect(greeting(page, 'Asha')).toBeVisible();

  // Session survives a reload.
  await page.reload();
  await expect(greeting(page, 'Asha')).toBeVisible();

  await page.evaluate(() => localStorage.setItem('akshar:test', 'cached'));
  await signOutViaSettings(page);
  expect(await page.evaluate(() => localStorage.getItem('akshar:test'))).toBeNull();
  expect(await storedUid(page)).toBeNull();

  await signIn(page, email, PASSWORD);
  await expect(greeting(page, 'Asha')).toBeVisible();
});

test('wrong credentials show one generic error', async ({ page }) => {
  const email = uniqueEmail('wrong');
  await signUpVerified(page, 'Ravi', email, PASSWORD);
  await signOutViaSettings(page);

  await signIn(page, email, 'not-the-password1');
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await signIn(page, uniqueEmail('nobody'), PASSWORD);
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
});

test('form validation shows inline errors', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter your name.')).toBeVisible();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await expect(page.getByText('Use 8 to 128 characters.')).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
});

test('forgot password sends a reset email without revealing accounts', async ({ page }) => {
  const email = uniqueEmail('reset');
  await signUpVerified(page, 'Meera', email, PASSWORD);
  await signOutViaSettings(page);

  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'reset link is on its way' })).toBeVisible();
  await expect
    .poll(async () => (await oobCodes(email)).some((c) => c.requestType === 'PASSWORD_RESET'))
    .toBe(true);

  // Same message for an email with no account.
  await page.goto('/forgot-password');
  const nobody = uniqueEmail('nobody');
  await page.getByLabel('Email').fill(nobody);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'reset link is on its way' })).toBeVisible();
});

test('guest upgrades to an account and keeps the same uid', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await expect(greeting(page, 'Guest')).toBeVisible();
  const guestUid = await storedUid(page);
  expect(guestUid).toBeTruthy();

  // Signing out as a guest asks first.
  await page.goto('/settings');
  await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign out of guest session?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Create account instead' }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByText("You're upgrading your guest session")).toBeVisible();

  const email = uniqueEmail('upgrade');
  await page.getByLabel('Name').fill('Kabir');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/verify-email$/);
  expect(await storedUid(page)).toBe(guestUid);

  await verifyEmailViaEmulator(email);
  await confirmVerified(page);
  await expect(greeting(page, 'Kabir')).toBeVisible();
  expect(await storedUid(page)).toBe(guestUid);
});

test('guest sign-out discards the session after confirmation', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await expect(greeting(page, 'Guest')).toBeVisible();
  await signOutViaSettings(page, { guest: true });
  expect(await storedUid(page)).toBeNull();
});

test.describe('Google sign-in', () => {
  // Firebase loads Google's gapi script from apis.google.com for popup sign-in even
  // against the emulator, so this one test depends on the live internet. Measured
  // flake rate about 4%; the assertions are unchanged, a failed attempt is retried.
  test.describe.configure({ retries: 2 });

  test('Google sign-in through the emulator popup', async ({ page }) => {
    await page.goto('/login');
    // Let the page finish loading Firebase's sign-in helper, as it would before a person clicks.
    await page.waitForLoadState('networkidle');
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    const popup = await popupPromise;
    // The emulator's fake IdP page wires its buttons after its scripts load.
    await popup.waitForLoadState('networkidle');
    await popup.getByText('Add new account').click();
    await expect(popup.locator('#email-input')).toBeVisible();
    const gEmail = uniqueEmail('google');
    await popup.locator('#email-input').fill(gEmail);
    await popup.locator('#display-name-input').fill('Gauri');
    // The emulator's fake Google page hands the result to Firebase's helper iframe in
    // this page and silently gives up if that iframe hasn't finished loading yet.
    await expect
      .poll(async () => {
        const frame = page.frames().find((f) => f.url().includes('/emulator/auth/iframe'));
        if (!frame) return false;
        await frame.waitForLoadState('load');
        return true;
      })
      .toBe(true);
    await popup.getByRole('button', { name: /Sign in with Google/ }).click();
    await expect(greeting(page, 'Gauri')).toBeVisible();
  });
});

test('offline state disables sign-in and explains why', async ({ page, context }) => {
  await page.goto('/login');
  await context.setOffline(true);
  await expect(page.getByText("You're offline. Reconnect to continue.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});

test('signed-in users skip the sign-in page', async ({ page }) => {
  await signUpVerified(page, 'Noor', uniqueEmail('skip'), PASSWORD);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/$/);
});

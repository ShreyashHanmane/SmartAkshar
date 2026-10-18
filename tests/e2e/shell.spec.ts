import { expect, test } from '@playwright/test';
import { isMobile, nav, openNav, signInAsGuest, storedUid, waitForServerDoc } from './helpers';

test.beforeEach(async ({ page }) => {
  await signInAsGuest(page);
});

test('navigation reaches every main area', async ({ page }) => {
  if (isMobile(page)) {
    const tabs = page.getByRole('navigation', { name: 'Sections' });
    await tabs.getByRole('link', { name: 'Flashcards' }).click();
    await expect(page.getByRole('heading', { name: 'Flashcards', level: 1 })).toBeVisible();
    await tabs.getByRole('link', { name: 'Profile' }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await tabs.getByRole('link', { name: 'Whiteboard' }).click();
    await expect(page).toHaveURL(/\/notebooks$/);
    await openNav(page);
    await nav(page).getByRole('link', { name: 'Library' }).click();
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeHidden();
  } else {
    const sidebar = nav(page);
    for (const [link, heading] of [
      ['Flashcards', 'Flashcards'],
      ['Library', 'Library'],
      ['Settings', 'Settings'],
    ]) {
      await sidebar.getByRole('link', { name: link }).click();
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    }
    await expect(sidebar.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  }
});

test('theme and text size apply instantly and persist across reloads', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('status').filter({ hasText: 'Settings saved.' })).toBeVisible();

  await page.getByRole('radio', { name: 'Large' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'lg');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('18px');

  // Keyboard: arrow keys move within the radio group.
  await page.getByRole('radio', { name: 'Left' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Right' })).toHaveAttribute('aria-checked', 'true');

  const uid = await storedUid(page);
  await waitForServerDoc(`users/${uid}`, (d) => {
    const s = d.settings as Record<string, unknown> | undefined;
    return s?.theme === 'dark' && s.textSize === 'lg' && s.toolbarSide === 'right';
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'lg');
  await expect(page.getByRole('radio', { name: 'Right' })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('radio', { name: 'Paper' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
});

test('subjects can be created, renamed, recoloured, and deleted', async ({ page }) => {
  await openNav(page);
  const sidebar = nav(page);
  await expect(sidebar.getByText('No subjects yet.', { exact: false })).toBeVisible();

  await sidebar.getByRole('button', { name: 'Add subject' }).click();
  const create = page.getByRole('dialog', { name: 'New subject' });
  await create.getByRole('button', { name: 'Create subject' }).click();
  await expect(create.getByText('Enter a subject name.')).toBeVisible();
  await create.getByLabel('Subject name').fill('Physics');
  await create.locator('label', { hasText: 'Teal' }).click();
  await create.getByRole('button', { name: 'Create subject' }).click();
  await expect(create).toBeHidden();
  await expect(sidebar.getByRole('link', { name: 'Physics' })).toBeVisible();

  await sidebar.getByRole('button', { name: 'Actions for Physics' }).click();
  await page.getByRole('menuitem', { name: 'Rename or recolour' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit subject' });
  await expect(edit.getByRole('radio', { name: 'Teal' })).toBeChecked();
  await edit.getByLabel('Subject name').fill('Mechanics');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(sidebar.getByRole('link', { name: 'Mechanics' })).toBeVisible();

  await sidebar.getByRole('button', { name: 'Actions for Mechanics' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete "Mechanics"?' });
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(sidebar.getByRole('link', { name: 'Mechanics' })).toBeHidden();
  await expect(sidebar.getByText('No subjects yet.', { exact: false })).toBeVisible();
});

test('subject menu works with the keyboard', async ({ page }) => {
  await openNav(page);
  const sidebar = nav(page);
  await sidebar.getByRole('button', { name: 'Add subject' }).click();
  await page.getByLabel('Subject name').fill('History');
  await page.keyboard.press('Enter');
  await expect(sidebar.getByRole('link', { name: 'History' })).toBeVisible();

  await sidebar.getByRole('button', { name: 'Actions for History' }).focus();
  await page.keyboard.press('ArrowDown');

  await expect(page.getByRole('menuitem', { name: 'Rename or recolour' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(sidebar.getByRole('button', { name: 'Actions for History' })).toBeFocused();
});

test('global search finds subjects and opens them', async ({ page }) => {
  await openNav(page);
  const sidebar = nav(page);
  await sidebar.getByRole('button', { name: 'Add subject' }).click();
  await page.getByLabel('Subject name').fill('Chemistry');
  await page.getByRole('button', { name: 'Create subject' }).click();
  await expect(sidebar.getByRole('link', { name: 'Chemistry' })).toBeVisible();
  if (isMobile(page)) await page.getByRole('button', { name: 'Close menu' }).click();

  if (isMobile(page)) await page.getByRole('link', { name: 'Search' }).click();
  else await page.goto('/');
  const box = page.getByRole('combobox', { name: 'Search notebooks, PDFs and flashcards' });
  await box.click();
  await box.fill('chem');
  await expect(page.getByRole('option', { name: /Chemistry/ })).toBeVisible();
  await box.press('Enter');
  await expect(page).toHaveURL(/\/notebooks\?subject=/);

  await page.goto(isMobile(page) ? '/search' : '/');
  await box.fill('zzz-nothing');
  await expect(page.getByText('Nothing matches "zzz-nothing".')).toBeVisible();
});

test('signing out resets the theme for the next person', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Sign out' }).last().click();
  await page.getByRole('button', { name: 'Sign out and discard' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

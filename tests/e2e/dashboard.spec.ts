import { expect, test } from '@playwright/test';
import {
  addSubjectViaUi,
  apiSend,
  createNotebookViaUi,
  dbRun,
  greeting,
  isMobile,
  localDayKey,
  myId,
  nav,
  openNav,
  packPoints,
  signUpFresh,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await signUpFresh(page, 'Guest');
});

test('a new account sees real, empty stats and helpful empty states', async ({ page }) => {
  await expect(greeting(page, 'Guest')).toBeVisible();
  await expect(page.getByText(/^\w+day, \w+ \d+$/)).toBeVisible();
  await expect(page.getByText('0.0', { exact: true })).toBeVisible();
  await expect(page.getByText('All caught up.')).toBeVisible();
  await expect(page.getByText('0-day streak')).toBeVisible();
  await expect(page.getByText('0%')).toBeVisible();
  await expect(page.getByText('No notebooks yet. Create your first one.')).toBeVisible();
  await expect(page.getByText('No books yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask AI' })).toBeEnabled();
});

test('create, rename, and delete a notebook', async ({ page }) => {
  await addSubjectViaUi(page, 'Physics');
  await page.goto('/');

  // Only title + subject are asked; the title is required.
  await page.getByRole('button', { name: /^Create notebook/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New notebook' });
  await dialog.getByRole('button', { name: 'Create notebook' }).click();
  await expect(dialog.getByText('Enter a title.')).toBeVisible();
  await expect(dialog.getByRole('textbox')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await createNotebookViaUi(page, 'Classical Mechanics', 'Physics');
  await page.goto('/');
  const card = page.getByRole('article').filter({ hasText: 'Classical Mechanics' });
  await expect(card).toBeVisible();
  await expect(card.getByText('Physics')).toBeVisible();
  await expect(card.getByText(/^Edited /)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Recent notebooks/ })).toContainText('· 1');

  // Sidebar subject count.
  await openNav(page);
  await expect(nav(page).getByRole('link', { name: /Physics/ })).toContainText('1');
  if (isMobile(page)) await page.getByRole('button', { name: 'Close menu' }).click();

  await card.getByRole('button', { name: 'Actions for Classical Mechanics' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename notebook' });
  await rename.getByLabel('Title').fill('Rotational Dynamics');
  await rename.getByRole('button', { name: 'Save' }).click();
  const renamed = page.getByRole('article').filter({ hasText: 'Rotational Dynamics' });
  await expect(renamed).toBeVisible();

  await renamed.getByRole('button', { name: 'Actions for Rotational Dynamics' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('dialog', { name: 'Delete "Rotational Dynamics"?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(renamed).toBeHidden();
  await expect(page.getByText('No notebooks yet. Create your first one.')).toBeVisible();
});

test('thumbnails preview the first page; empty notebooks show a placeholder', async ({ page }) => {
  const id = await createNotebookViaUi(page, 'Waves');
  await page.goto('/');
  const card = page.getByRole('article').filter({ hasText: 'Waves' });
  // Thumbnails load lazily once scrolled into view (on mobile the card starts below the fold).
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText('Waves')).toBeVisible();
  await expect(card.locator('canvas')).toBeHidden();

  await apiSend(page, 'PUT', `/api/notebooks/${id}/pages/p0`, {
    index: 0,
    elements: [
      {
        k: 's',
        id: 's1',
        tool: 'pen',
        c: '#1270c4',
        w: 6,
        o: 1,
        pts: packPoints([
          [80, 60],
          [300, 120],
          [600, 60],
          [900, 120],
        ]),
      },
    ],
  });
  const canvas = card.locator('canvas');
  await expect(canvas).toBeVisible();
  const countInk = () =>
    canvas.evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext('2d');
      if (!ctx) return 0;
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let blue = 0;
      for (let i = 0; i < data.length; i += 4) if ((data[i + 2] ?? 0) > 150 && (data[i] ?? 255) < 60) blue++;
      return blue;
    });
  await expect.poll(countInk).toBeGreaterThan(50);
});

test('stats come from tracked study time and due cards', async ({ page }) => {
  const uid = await myId(page);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  dbRun('INSERT INTO activity (user_id, day, seconds) VALUES (?, ?, 3600)', uid, localDayKey(today));
  dbRun('INSERT INTO activity (user_id, day, seconds) VALUES (?, ?, 1800)', uid, localDayKey(yesterday));
  dbRun('INSERT INTO cards (user_id, id, due) VALUES (?, ?, ?)', uid, 'c1', Date.now() - 3600_000);
  dbRun('INSERT INTO cards (user_id, id, due) VALUES (?, ?, ?)', uid, 'c2', Date.now() + 7 * 24 * 3600_000);
  await page.reload();

  // Monday-start week: yesterday only counts if it is in the same week.
  const sameWeek = today.getDay() !== 1;
  await expect(page.getByText(sameWeek ? '1.5' : '1.0', { exact: true })).toBeVisible();
  await expect(page.getByText('2-day streak')).toBeVisible();
  await expect(page.getByText(sameWeek ? '15%' : '10%')).toBeVisible();
  await expect(
    page.locator('section').filter({ has: page.getByRole('heading', { name: 'Flashcards due' }) }),
  ).toContainText(/1\s*cards today/);
  await expect(page.getByRole('link', { name: 'Review now' })).toHaveAttribute('href', '/flashcards/review');

  await page.getByRole('button', { name: 'Edit goal' }).click();
  const dialog = page.getByRole('dialog', { name: 'Weekly study goal' });
  await dialog.getByLabel('Hours per week').fill('100');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Enter a whole number from 1 to 80.')).toBeVisible();
  await dialog.getByLabel('Hours per week').fill('5');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Weekly goal · 5h')).toBeVisible();
  await expect(page.getByText(sameWeek ? '30%' : '20%')).toBeVisible();
});

test('notebooks page filters by subject', async ({ page }) => {
  await addSubjectViaUi(page, 'Chemistry');
  await createNotebookViaUi(page, 'Organic', 'Chemistry');
  await page.goto('/notebooks');
  await createNotebookViaUi(page, 'Loose notes');
  await page.goto('/notebooks');
  await expect(page.getByRole('article')).toHaveCount(2);

  await page
    .getByRole('navigation', { name: 'Filter by subject' })
    .getByRole('link', { name: 'Chemistry' })
    .click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('Organic');

  // Unknown subject ids in the URL are ignored.
  await page.goto('/notebooks?subject=not-mine');
  await expect(page.getByRole('article')).toHaveCount(2);
});

test('mobile and desktop "+ New" open the same dialog', async ({ page }) => {
  const button = isMobile(page)
    ? page.getByRole('button', { name: 'New notebook' })
    : nav(page).getByRole('button', { name: 'New notebook' });
  await button.click();
  await expect(page.getByRole('dialog', { name: 'New notebook' })).toBeVisible();
});

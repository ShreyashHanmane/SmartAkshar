import { type Page, expect, test } from '@playwright/test';
import { PDF_PAGES, makePdf } from './fixtures';
import { apiGet, apiSend, isMobile, nav, openNav, signUpFresh } from './helpers';

type ApiDeck = { id: string; title: string; total: number; due: number };
const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};
const decksOf = async (page: Page) =>
  (await apiGet<ApiDeck[]>(page, `/api/decks?before=${endOfToday()}`)) ?? [];

async function makeDeck(page: Page, title: string, cards: [string, string][]) {
  const res = await page.request.post('/api/decks', {
    headers: { 'X-Akshar': '1' },
    data: { title, subjectId: null },
  });
  const { id } = (await res.json()) as { id: string };
  for (const [front, back] of cards) await apiSend(page, 'POST', `/api/decks/${id}/cards`, { front, back });
  return id;
}

test.beforeEach(async ({ page }) => {
  await signUpFresh(page);
});

test('create a deck, add cards, and see due counts', async ({ page }) => {
  await page.goto('/flashcards');
  await expect(page.getByText('No decks yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Create deck' }).click();
  const dialog = page.getByRole('dialog', { name: 'New deck' });
  await dialog.getByRole('button', { name: 'Create deck' }).click();
  await expect(dialog.getByText('Enter a deck name.')).toBeVisible();
  await dialog.getByLabel('Deck name').fill('Mechanics essentials');
  await dialog.getByRole('button', { name: 'Create deck' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Mechanics essentials' })).toContainText(
    'Empty deck — add a card to begin.',
  );

  await page.getByRole('link', { name: 'Mechanics essentials' }).click();
  const cards: [string, string][] = [
    ['Newton’s second law?', 'F = ma'],
    ['Unit of force?', 'newton'],
  ];
  for (const [q, a] of cards) {
    await page.getByLabel('Question').fill(q);
    await page.getByLabel('Answer').fill(a);
    await page.getByRole('button', { name: 'Add card' }).click();
    await expect(page.getByText(q)).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: '2 cards' })).toBeVisible();

  await page.getByRole('link', { name: 'Back to decks' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Mechanics essentials' })).toContainText(
    '2 cards · 2 due',
  );
  await openNav(page);
  await expect(nav(page).getByRole('link', { name: /Flashcards/ })).toContainText('2');
});

test('review: flip, swipe right to know, button for "don’t know", and the schedule is saved', async ({
  page,
}) => {
  const deck = await makeDeck(page, 'Physics', [
    ['Q1', 'A1'],
    ['Q2', 'A2'],
  ]);
  await page.goto('/flashcards');
  await page.getByRole('link', { name: 'Review Physics' }).click();
  const card = page.getByTestId('card-text');
  const first = await card.textContent();
  await page.getByRole('button', { name: /Press Space to show the answer/ }).click();
  await expect(card).toHaveText(first === 'Q1' ? 'A1' : 'A2');

  // Swipe right = know it.
  const box = await page.getByRole('button', { name: /Answer shown/ }).boundingBox();
  if (!box) throw new Error('no card');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 180, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('1 left')).toBeVisible();

  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /Don't know/ }).click();
  // A forgotten card comes back once at the end of the session.
  await expect(page.getByText('1 left')).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(page.getByText('You knew 2 and will see 1 again soon.')).toBeVisible();
  await expect.poll(async () => (await decksOf(page)).find((d) => d.id === deck)?.due).toBe(0);
});

test('quiz offers the right answer among choices and scores the result', async ({ page }) => {
  const deck = await makeDeck(page, 'Chemistry', [
    ['Symbol for sodium?', 'Na'],
    ['Symbol for potassium?', 'K'],
    ['Symbol for iron?', 'Fe'],
  ]);
  await page.goto(`/flashcards/${deck}/quiz`);
  for (let i = 0; i < 3; i++) {
    const question = (await page.locator('p.text-xl').textContent()) ?? '';
    const answer =
      { 'Symbol for sodium?': 'Na', 'Symbol for potassium?': 'K', 'Symbol for iron?': 'Fe' }[question] ?? '';
    await expect(page.getByRole('radio')).toHaveCount(3);
    await page.getByRole('radio', { name: answer, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
    await page.getByRole('button', { name: i < 2 ? 'Next question' : 'See score' }).click();
  }
  await expect(page.getByText('You scored 3 out of 3.')).toBeVisible();
});

test('edit and delete cards; rename and delete a deck', async ({ page }) => {
  const deck = await makeDeck(page, 'History', [['Year of Indian independence?', '1946']]);
  await page.goto(`/flashcards/${deck}`);
  await page.getByRole('button', { name: /Actions for card Year of Indian/ }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('dialog', { name: 'Edit card' }).getByLabel('Answer').fill('1947');
  await page.getByRole('dialog', { name: 'Edit card' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('1947')).toBeVisible();

  await page.getByRole('button', { name: 'Deck actions' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByRole('dialog', { name: 'Edit deck' }).getByLabel('Deck name').fill('Modern India');
  await page.getByRole('dialog', { name: 'Edit deck' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Modern India', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: /Actions for card Year of Indian/ }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByText('Empty deck — add a card to begin.')).toBeVisible();

  await page.getByRole('button', { name: 'Deck actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('dialog', { name: 'Delete "Modern India"?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page).toHaveURL(/\/flashcards$/);
  expect(await decksOf(page)).toEqual([]);
});

test('Create tab starts a deck when there is none; Progress shows real numbers', async ({ page }) => {
  await page.goto('/flashcards?tab=create');
  await page.getByLabel('New deck name').fill('Biology');
  await page.getByLabel('Question').fill('Powerhouse of the cell?');
  await page.getByLabel('Answer').fill('Mitochondria');
  await page.getByRole('button', { name: 'Add card' }).click();
  await expect
    .poll(async () => (await decksOf(page)).map((d) => [d.title, d.total]))
    .toEqual([['Biology', 1]]);

  await page.getByRole('tab', { name: 'Progress' }).click();
  const total = page.locator('dt', { hasText: 'Cards' }).locator('xpath=following-sibling::dd');
  await expect(total).toHaveText('1');
  await expect(page.getByText('0 of 1 learned')).toBeVisible();
});

test('create a flashcard from text selected in a book', async ({ page }) => {
  test.skip(isMobile(page), 'selection menu is covered on desktop and tablet');
  await makeDeck(page, 'Reading cards', []);
  const up = await page.request.post('/api/books', {
    headers: {
      'X-Akshar': '1',
      'X-File-Name': 'ch4.pdf',
      'Content-Type': 'application/pdf',
      'X-Title': 'Laws',
    },
    data: makePdf(PDF_PAGES),
  });
  const { id } = (await up.json()) as { id: string };
  await page.goto(`/library/${id}`);
  await expect(page.locator('.textLayer').getByText('inversely', { exact: false })).toBeAttached();
  await page.locator('body').evaluate((body) => {
    const walker = body.ownerDocument.createTreeWalker(
      body.querySelector('.textLayer') ?? body,
      NodeFilter.SHOW_TEXT,
    );
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n as Text).data.indexOf('inversely');
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + 'inversely'.length);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(r);
        document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        return;
      }
    }
  });
  await page
    .getByRole('toolbar', { name: 'Selected text' })
    .getByRole('button', { name: 'Create flashcard' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Create flashcard' });
  await expect(dialog.getByLabel('Answer')).toHaveValue('inversely');
  await dialog.getByLabel('Question').fill('How does acceleration depend on mass?');
  await dialog.getByRole('button', { name: 'Add card' }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => (await decksOf(page)).find((d) => d.title === 'Reading cards')?.total)
    .toBe(1);
});

test('dashboard "Review now" reviews due cards from every deck', async ({ page }) => {
  await makeDeck(page, 'A', [['qa', 'aa']]);
  await makeDeck(page, 'B', [['qb', 'ab']]);
  await page.goto('/');
  await page.getByRole('link', { name: 'Review now' }).click();
  await expect(page.getByText('2 left')).toBeVisible();
});

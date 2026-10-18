import { type Page, expect, test } from '@playwright/test';
import { PDF_PAGES, TXT, makeEpub, makePdf } from './fixtures';
import { apiGet, isMobile, signUpFresh } from './helpers';

type ApiBook = {
  id: string;
  title: string;
  author: string | null;
  format: string;
  pageCount: number;
  position: { page?: number };
  notebookId: string | null;
};

test.beforeEach(async ({ page }) => {
  await signUpFresh(page);
  await page.goto('/library');
  await expect(page.getByText('Your library is empty.')).toBeVisible();
});

async function importFile(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.getByLabel('Import PDF or book').setInputFiles({ name, mimeType, buffer });
}

async function importAndGet(page: Page, name: string, mimeType: string, buffer: Buffer, title: string) {
  await importFile(page, name, mimeType, buffer);
  await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
  const books = (await apiGet<ApiBook[]>(page, '/api/books')) ?? [];
  const book = books.find((b) => b.title === title);
  if (!book) throw new Error(`book ${title} not found`);
  return book;
}

/** Selects `text` inside `root` (a document or frame) and lets the app see the selection. */
async function selectText(page: Page, text: string, frameSelector?: string) {
  const target = frameSelector ? page.frameLocator(frameSelector).locator('body') : page.locator('body');
  await target.evaluate((body, needle) => {
    const doc = body.ownerDocument;
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n as Text).data.indexOf(needle);
      if (i >= 0) {
        const range = doc.createRange();
        range.setStart(n, i);
        range.setEnd(n, i + needle.length);
        const sel = doc.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        doc.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        return;
      }
    }
    throw new Error(`text not found: ${needle}`);
  }, text);
}

test('imports PDF, EPUB, and TXT with metadata; filters; rejects disguised files', async ({ page }) => {
  const pdf = await importAndGet(page, 'ch4.pdf', 'application/pdf', makePdf(PDF_PAGES), 'Laws of Motion');
  expect(pdf).toMatchObject({ format: 'pdf', author: 'HC Verma', pageCount: 2 });
  const epub = await importAndGet(
    page,
    'history.epub',
    'application/epub+zip',
    makeEpub(),
    'A Brief History of Time',
  );
  expect(epub).toMatchObject({ format: 'epub', author: 'Stephen Hawking', pageCount: 2 });
  await importAndGet(page, 'organic_reactions.txt', 'text/plain', Buffer.from(TXT), 'organic reactions');
  await expect(page.getByText('Stephen Hawking · 2 chapters')).toBeVisible();

  await page.getByRole('tab', { name: 'EPUB' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(3);

  await importFile(
    page,
    'page.pdf',
    'application/pdf',
    Buffer.from('<html><script>alert(1)</script></html>'),
  );
  await expect(page.getByText('Only PDF, EPUB, and TXT files can be added', { exact: false })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(3);
});

test('reads a PDF page by page and remembers the position', async ({ page }) => {
  const book = await importAndGet(page, 'ch4.pdf', 'application/pdf', makePdf(PDF_PAGES), 'Laws of Motion');
  await page.getByRole('link', { name: 'Read Laws of Motion', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Page 1 of 2' })).toBeVisible();
  await expect(page.locator('.textLayer').getByText('inversely', { exact: false })).toBeAttached();

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Page 2 of 2' })).toBeVisible();
  await expect(page.locator('.textLayer').getByText('F = ma')).toBeAttached();
  await expect
    .poll(async () => (await apiGet<ApiBook>(page, `/api/books/${book.id}`))?.position.page)
    .toBe(2);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Page 2 of 2' })).toBeVisible();
});

test('highlights PDF text, keeps it after reload, and removes it', async ({ page }) => {
  const book = await importAndGet(page, 'ch4.pdf', 'application/pdf', makePdf(PDF_PAGES), 'Laws of Motion');
  await page.goto(`/library/${book.id}`);
  await expect(page.locator('.textLayer').getByText('inversely', { exact: false })).toBeAttached();
  await selectText(page, 'inversely');
  const menu = page.getByRole('toolbar', { name: 'Selected text' });
  for (const name of ['Create flashcard', 'Explain', 'Summarize', 'Translate'])
    await expect(menu.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true');
  await menu.getByRole('button', { name: 'Highlight' }).click();
  await expect
    .poll(async () => ((await apiGet<unknown[]>(page, `/api/books/${book.id}/highlights`)) ?? []).length)
    .toBe(1);
  await expect(page.locator('mark.akshar-hl')).toHaveText('inversely');

  await page.reload();
  const mark = page.locator('mark.akshar-hl');
  await expect(mark).toHaveText('inversely');
  await mark.click({ force: true });
  await page.getByRole('button', { name: 'Remove highlight' }).click();
  await expect
    .poll(async () => ((await apiGet<unknown[]>(page, `/api/books/${book.id}/highlights`)) ?? []).length)
    .toBe(0);
  await expect(page.locator('mark.akshar-hl')).toHaveCount(0);
});

test('EPUB chapters render sandboxed: no scripts, no remote resources, no external links', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  const book = await importAndGet(
    page,
    'history.epub',
    'application/epub+zip',
    makeEpub(),
    'A Brief History of Time',
  );
  await page.goto(`/library/${book.id}`);
  const iframe = page.locator('iframe[title="Chapter 1"]');
  await expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin');
  const frame = page.frameLocator('iframe[title="Chapter 1"]');
  await expect(frame.getByRole('heading', { name: 'Our Picture of the Universe' })).toBeVisible();
  await frame.getByText('Click me').click();
  await expect(frame.getByText('external link')).toBeVisible();
  expect(
    await frame.getByText('external link').evaluate((el) => el.closest('a')?.getAttribute('href') ?? null),
  ).toBeNull();
  expect(await frame.locator('img, script').count()).toBe(0);
  expect(await frame.locator('[style], [onclick]').count()).toBe(0);
  expect(
    await page.evaluate(() => (window as unknown as { __epubPwned?: boolean }).__epubPwned),
  ).toBeUndefined();
  expect(requests.some((u) => u.includes('tracker.example') || u.includes('evil.example'))).toBe(false);

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Chapter 2 of 2' })).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Chapter 2"]').getByRole('heading', { name: 'Space and Time' }),
  ).toBeVisible();
});

test('highlights inside EPUB and TXT books', async ({ page }) => {
  const epub = await importAndGet(
    page,
    'history.epub',
    'application/epub+zip',
    makeEpub(),
    'A Brief History of Time',
  );
  await page.goto(`/library/${epub.id}`);
  await expect(
    page.frameLocator('iframe[title="Chapter 1"]').getByText('public lecture', { exact: false }),
  ).toBeVisible();
  await selectText(page, 'public lecture', 'iframe[title="Chapter 1"]');
  await page
    .getByRole('toolbar', { name: 'Selected text' })
    .getByRole('button', { name: 'Highlight' })
    .click();
  await expect(page.frameLocator('iframe[title="Chapter 1"]').locator('mark.akshar-hl')).toHaveText(
    'public lecture',
  );

  await page.goto('/library');
  const txt = await importAndGet(
    page,
    'organic_reactions.txt',
    'text/plain',
    Buffer.from(TXT),
    'organic reactions',
  );
  await page.goto(`/library/${txt.id}`);
  await expect(page.getByText('Addition reactions', { exact: false })).toBeVisible();
  await selectText(page, 'double bond');
  await page
    .getByRole('toolbar', { name: 'Selected text' })
    .getByRole('button', { name: 'Highlight' })
    .click();
  await expect(page.locator('mark.akshar-hl')).toHaveText('double bond');
});

test('reading with notes creates a linked notebook and saves handwriting', async ({ page }) => {
  const book = await importAndGet(page, 'ch4.pdf', 'application/pdf', makePdf(PDF_PAGES), 'Laws of Motion');
  await page.getByRole('link', { name: 'Read Laws of Motion with notes' }).click();
  await expect(page).toHaveURL(/notes=1/);
  if (isMobile(page)) {
    await page.getByRole('radio', { name: 'Notes' }).click();
  } else {
    await expect(page.getByRole('heading', { name: 'Page 1 of 2' })).toBeVisible();
    await expect(page.getByRole('separator', { name: 'Resize panes' })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Notes · Page 1' })).toBeVisible();
  await expect
    .poll(async () => (await apiGet<ApiBook>(page, `/api/books/${book.id}`))?.notebookId)
    .toBeTruthy();
  const notebookId = (await apiGet<ApiBook>(page, `/api/books/${book.id}`))?.notebookId ?? '';

  const canvas = page.getByRole('img', { name: /Page 1 of 1/ });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.35, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        ((await apiGet<{ elements: unknown[] }[]>(page, `/api/notebooks/${notebookId}/pages`)) ?? [])[0]
          ?.elements.length,
    )
    .toBe(1);
  const nb = await apiGet<{ title: string }>(page, `/api/notebooks/${notebookId}`);
  expect(nb?.title).toBe('Laws of Motion — Notes');
});

test('rename and delete a book', async ({ page }) => {
  const book = await importAndGet(
    page,
    'organic_reactions.txt',
    'text/plain',
    Buffer.from(TXT),
    'organic reactions',
  );
  await page.getByRole('button', { name: 'Actions for organic reactions' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByRole('dialog', { name: 'Rename book' }).getByLabel('Title').fill('Organic Chemistry');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: /Organic Chemistry/ })).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Organic Chemistry' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('dialog', { name: 'Delete "Organic Chemistry"?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByText('Your library is empty.')).toBeVisible();
  expect((await page.request.get(`/api/books/${book.id}/file`)).status()).toBe(404);
});

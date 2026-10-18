import { type Page, expect, test } from '@playwright/test';
import { apiGet, createNotebookViaUi, signUpFresh } from './helpers';

let current: Page;
let notebookId = '';
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ page }) => {
  current = page;
  await signUpFresh(page);
  notebookId = await createNotebookViaUi(page, 'Kinematics');
  await page.getByRole('radio', { name: 'Notes' }).click();
  await expect(page).toHaveURL(/view=notes/);
  await expect(editor(page)).toBeVisible();
});

const editor = (page: Page) => page.getByRole('textbox', { name: 'Notes' });
const noteJson = async () =>
  JSON.stringify(
    (await apiGet<{ content: unknown }>(current, `/api/notebooks/${notebookId}/note`))?.content ?? null,
  );
const fmt = (page: Page, name: string) =>
  page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name, exact: true });

test('formatting, autosave, reload, and undo/redo', async ({ page }) => {
  await editor(page).click();
  await fmt(page, 'Heading 1').click();
  await page.keyboard.type('Equations of motion');
  await page.keyboard.press('Enter');
  await fmt(page, 'Bold').click();
  await page.keyboard.type('v = u + at');
  await fmt(page, 'Bold').click();
  await page.keyboard.press('Enter');
  await fmt(page, 'Bulleted list').click();
  await page.keyboard.type('uniform acceleration');

  await expect(fmt(page, 'Bulleted list')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(noteJson).toContain('"type":"heading"');
  const saved = await noteJson();
  expect(saved).toContain('"level":1');
  expect(saved).toContain('{"type":"bold"}');
  expect(saved).toContain('"type":"bulletList"');
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();

  await page.reload();
  await expect(editor(page).getByRole('heading', { name: 'Equations of motion' })).toBeVisible();
  await expect(editor(page).locator('strong')).toHaveText('v = u + at');

  await editor(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' extra');
  await expect(editor(page)).toContainText('extra');
  await fmt(page, 'Undo').click();
  await expect(editor(page)).not.toContainText('extra');
  await fmt(page, 'Redo').click();
  await expect(editor(page)).toContainText('extra');
});

test('links must be web or email addresses', async ({ page }) => {
  await editor(page).click();
  await page.keyboard.type('Read more');
  await page.keyboard.press('Shift+Home');
  await fmt(page, 'Link').click();
  const dialog = page.getByRole('dialog', { name: 'Add a link' });
  await dialog.getByLabel('Web address').fill('javascript:alert(1)');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Enter a web (https://) or email (mailto:) address.')).toBeVisible();
  await dialog.getByLabel('Web address').fill('example.com/physics');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const link = editor(page).getByRole('link', { name: 'Read more' });
  await expect(link).toHaveAttribute('href', 'https://example.com/physics');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  await expect.poll(noteJson).toContain('https://example.com/physics');
});

test('pasted HTML is sanitised: no scripts, remote images, or unsafe links', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await editor(page).click();
  await editor(page).evaluate((el) => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      '<p>Safe <b>bold</b><script>window.__pwned = true</script>' +
        '<img src="https://tracker.example/pixel.png" onerror="window.__pwned = true">' +
        '<a href="javascript:window.__pwned = true">bad link</a></p>',
    );
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(editor(page)).toContainText('Safe bold');
  await expect(editor(page).locator('img')).toHaveCount(0);
  await expect(editor(page).locator('script')).toHaveCount(0);
  await expect(editor(page).locator('a[href^="javascript"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined();
  expect(requests.some((u) => u.includes('tracker.example'))).toBe(false);
  await expect.poll(noteJson).toContain('Safe');
  expect(await noteJson()).not.toContain('tracker.example');
  expect(await noteJson()).not.toContain('javascript');
});

test('images upload to the user’s own storage; disguised files are rejected', async ({ page }) => {
  await editor(page).click();
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: 'diagram.png', mimeType: 'image/png', buffer: PNG_1PX });
  const img = editor(page).locator('img');
  await expect(img).toHaveCount(1);
  await expect(img).toHaveAttribute('alt', 'diagram');
  const src = (await img.getAttribute('src')) ?? '';
  expect(src).toMatch(/^\/api\/files\/images\/[0-9a-f]{32}\.png$/);
  await expect.poll(noteJson).toContain(src);

  await input.setInputFiles({
    name: 'evil.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  });
  await expect(page.getByText('Only PNG, JPEG, GIF, and WebP images can be added.')).toBeVisible();
  await expect(img).toHaveCount(1);
});

test('deleting the notebook removes its notes and images', async ({ page }) => {
  await editor(page).click();
  await page.keyboard.type('temporary');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG_1PX });
  await expect(editor(page).locator('img')).toHaveCount(1);
  await expect.poll(noteJson).toContain('/api/files/images/');
  const src = (await editor(page).locator('img').getAttribute('src')) ?? '';

  await page.getByRole('button', { name: 'More options' }).click();
  await expect(page.getByRole('menuitem', { name: 'Export Word (DOCX)' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('dialog', { name: 'Delete "Kinematics"?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page).toHaveURL(/\/notebooks$/);
  expect(await apiGet(page, `/api/notebooks/${notebookId}/note`)).toBeNull();
  expect((await page.request.get(src)).status()).toBe(404);
});

test('switching back to the whiteboard keeps the notebook', async ({ page }) => {
  await page.getByRole('radio', { name: 'Whiteboard' }).click();
  await expect(page).not.toHaveURL(/view=notes/);
  await expect(page.getByRole('img', { name: /Page 1 of 1/ })).toBeVisible();
});

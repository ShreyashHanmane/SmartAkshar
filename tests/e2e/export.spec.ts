import { type Download, type Page, expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { unzip } from '../../src/shared/zip';
import { apiSend, createNotebookViaUi, signUpFresh } from './helpers';

/** Runs an action that downloads a file; returns its name and bytes. */
async function downloaded(
  page: Page,
  action: () => Promise<void>,
): Promise<{ name: string; bytes: Uint8Array }> {
  const [download] = await Promise.all([page.waitForEvent('download'), action()]);
  const path = await (download as Download).path();
  return { name: download.suggestedFilename(), bytes: new Uint8Array(await readFile(path)) };
}

async function openPdf(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  const sizes: [number, number][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
    sizes.push([Math.round(vp.width), Math.round(vp.height)]);
  }
  await task.destroy();
  return sizes;
}

/** Decodes a PNG in the browser: its size and the distinct colours down the middle column. */
async function middleColumn(page: Page, png: Uint8Array) {
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(bitmap, 0, 0);
    const d = ctx?.getImageData(bitmap.width / 2, 0, 1, bitmap.height).data ?? new Uint8ClampedArray();
    const colours = new Set<string>();
    for (let i = 0; i < d.length; i += 4) colours.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return { size: [bitmap.width, bitmap.height], colours: [...colours] };
  }, Buffer.from(png).toString('base64'));
}

const menu = async (page: Page, item: string) => {
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

test.beforeEach(async ({ page }) => {
  await signUpFresh(page);
});

test('whiteboard: PDF of this page or all pages, and a PNG of the page', async ({ page }) => {
  await createNotebookViaUi(page, 'Optics: lenses');
  const canvas = page.getByRole('img', { name: /Page 1 of 1/ });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  // A thick horizontal pen line across the middle of page 1 (drawn just now, maybe not saved yet).
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 10 });
  await page.mouse.up();

  const png = await downloaded(page, () => menu(page, 'Export image'));
  expect(png.name).toBe('Optics lenses.png');
  const column = await middleColumn(page, png.bytes);
  expect(column.size).toEqual([2000, 2828]); // A4 page at print resolution
  expect(column.colours).toContain('255,255,255'); // white paper
  expect(column.colours).toContain('15,42,74'); // the stroke, in the default navy ink

  await page.getByRole('button', { name: 'Add page' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();

  await menu(page, 'Export PDF');
  const dialog = page.getByRole('dialog', { name: 'Export PDF' });
  await expect(dialog.getByRole('radio', { name: 'This page (2)' })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('radio', { name: 'All pages (2)' }).click();
  const all = await downloaded(page, () =>
    dialog.getByRole('button', { name: 'Export', exact: true }).click(),
  );
  expect(all.name).toBe('Optics lenses.pdf');
  expect(await openPdf(all.bytes)).toEqual([
    [595, 842],
    [595, 842],
  ]);
  await expect(page.getByText('Saved Optics lenses.pdf to your downloads.')).toBeVisible();
  await expect(dialog).toBeHidden();

  await menu(page, 'Export PDF');
  const one = await downloaded(page, () =>
    page
      .getByRole('dialog', { name: 'Export PDF' })
      .getByRole('button', { name: 'Export', exact: true })
      .click(),
  );
  expect(await openPdf(one.bytes)).toHaveLength(1);
});

test('notes: Word and PDF exports include what was just typed', async ({ page }) => {
  await createNotebookViaUi(page, 'Momentum');
  await page.getByRole('radio', { name: 'Notes' }).click();
  const editor = page.getByRole('textbox', { name: 'Notes' });
  await editor.click();
  await page.keyboard.type('Momentum is conserved in a closed system');

  const docx = await downloaded(page, () => menu(page, 'Export Word (DOCX)'));
  expect(docx.name).toBe('Momentum.docx');
  const files = await unzip(docx.bytes);
  const xml = new TextDecoder().decode(files.get('word/document.xml'));
  expect(xml).toContain('Momentum is conserved in a closed system');

  await menu(page, 'Export PDF');
  const dialog = page.getByRole('dialog', { name: 'Export PDF' });
  await expect(dialog).toContainText('A4 PDF');
  const pdf = await downloaded(page, () =>
    dialog.getByRole('button', { name: 'Export', exact: true }).click(),
  );
  expect(pdf.name).toBe('Momentum notes.pdf');
  expect(await openPdf(pdf.bytes)).toEqual([[595, 842]]);
});

test('flashcards: a deck exports as CSV, with formulas neutralised', async ({ page }) => {
  const res = await page.request.post('/api/decks', {
    headers: { 'X-Akshar': '1' },
    data: { title: 'Algebra', subjectId: null },
  });
  const { id } = (await res.json()) as { id: string };
  await apiSend(page, 'POST', `/api/decks/${id}/cards`, { front: 'What is 2+2, "roughly"?', back: '=2+2' });
  await page.goto(`/flashcards/${id}`);
  await expect(page.getByText('What is 2+2')).toBeVisible();
  await page.getByRole('button', { name: 'Deck actions' }).click();
  const csv = await downloaded(page, () => page.getByRole('menuitem', { name: 'Export CSV' }).click());
  expect(csv.name).toBe('Algebra.csv');
  const text = new TextDecoder().decode(csv.bytes);
  expect(text).toContain('"front","back","deck","box","due"');
  expect(text).toContain(`"What is 2+2, ""roughly""?","'=2+2","Algebra","1"`);
});

test('settings: export all data as one ZIP', async ({ page }) => {
  await apiSend(page, 'PUT', '/api/notebooks/nbzip', { title: 'Thermodynamics', subjectId: null });
  await page.goto('/settings');
  const zip = await downloaded(page, () => page.getByRole('button', { name: 'Export ZIP' }).click());
  expect(zip.name).toMatch(/^akshar-export-\d{4}-\d\d-\d\d\.zip$/);
  const files = await unzip(zip.bytes);
  expect(files.has('README.txt')).toBe(true);
  const data = JSON.parse(new TextDecoder().decode(files.get('data.json'))) as {
    notebooks: { title: string }[];
  };
  expect(data.notebooks.map((n) => n.title)).toEqual(['Thermodynamics']);
  await expect(page.getByRole('button', { name: 'Export ZIP' })).toBeVisible(); // back to idle
});

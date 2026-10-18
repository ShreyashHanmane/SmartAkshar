import { type Page, expect, test } from '@playwright/test';
import { apiGet, apiSend, createNotebookViaUi, isMobile, packPoints, signUpFresh } from './helpers';

let notebookId = '';
let current: Page;

test.beforeEach(async ({ page }) => {
  current = page;
  await signUpFresh(page);
  notebookId = await createNotebookViaUi(page, 'Newton’s Laws');
  await expect(page.getByRole('img', { name: /Page 1 of 1/ })).toBeVisible();
});

type ApiPage = { id: string; index: number; elements: Record<string, unknown>[] };
const pagesOf = async () => (await apiGet<ApiPage[]>(current, `/api/notebooks/${notebookId}/pages`)) ?? [];
const elementsOf = async (index = 0) => (await pagesOf()).find((p) => p.index === index)?.elements ?? [];
const notebookOf = async () =>
  (await apiGet<Record<string, unknown>>(current, `/api/notebooks/${notebookId}`)) ?? {};
async function waitForNotebook(check: (d: Record<string, unknown>) => boolean) {
  await expect.poll(async () => check(await notebookOf())).toBe(true);
}

/** Draws a polyline on the page using fractions of the canvas box (0..1). */
async function draw(page: Page, points: [number, number][]) {
  const box = await page.getByRole('img', { name: /Page|Infinite canvas/ }).boundingBox();
  if (!box) throw new Error('no canvas');
  const at = ([fx, fy]: [number, number]) => [box.x + box.width * fx, box.y + box.height * fy] as const;
  const [sx, sy] = at(points[0] as [number, number]);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (const p of points.slice(1)) {
    const [x, y] = at(p);
    await page.mouse.move(x, y, { steps: 6 });
  }
  await page.mouse.up();
}

const loop: [number, number][] = [
  [0.35, 0.3],
  [0.65, 0.3],
  [0.65, 0.55],
  [0.35, 0.55],
  [0.35, 0.3],
];

async function tool(page: Page, name: RegExp) {
  await page.getByRole('toolbar', { name: 'Drawing tools' }).getByRole('button', { name }).click();
}

test('opens with the design’s top bar, toolbar, and bottom bar', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Newton’s Laws' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Paged' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
  const toolbar = page.getByRole('toolbar', { name: 'Drawing tools' });
  for (const name of [
    'Lasso (L)',
    'Pen (P)',
    'Highlighter (H)',
    'Eraser (E)',
    'Shapes (S)',
    'Text (T)',
    'Undo',
    'Redo',
    'Paper and background',
  ])
    await expect(toolbar.getByRole('button', { name })).toBeVisible();
  await expect(toolbar.getByRole('radio')).toHaveCount(5);
  await expect(toolbar.getByRole('slider')).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI study help' })).toBeEnabled();
  // The mobile tab bar is hidden inside the whiteboard.
  await expect(page.getByRole('navigation', { name: 'Sections' })).toHaveCount(0);
});

test('pen strokes autosave, survive a reload, and undo/redo', async ({ page }) => {
  await draw(page, [
    [0.3, 0.3],
    [0.5, 0.35],
    [0.7, 0.3],
  ]);
  await expect.poll(async () => (await elementsOf()).length).toBe(1);
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  const [stroke] = await elementsOf();
  expect(stroke).toMatchObject({ k: 's', tool: 'pen', c: '#0f2a4a', w: 3 });

  await page.reload();
  await expect(page.getByRole('img', { name: /Page 1 of 1, 1 items/ })).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).isDisabled();
  await draw(page, [
    [0.3, 0.6],
    [0.6, 0.6],
  ]);
  await expect.poll(async () => (await elementsOf()).length).toBe(2);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await elementsOf()).length).toBe(1);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(async () => (await elementsOf()).length).toBe(2);
});

test('highlighter, colours, size slider, shapes, and text', async ({ page }) => {
  const toolbar = page.getByRole('toolbar', { name: 'Drawing tools' });
  await tool(page, /^Highlighter/);
  await toolbar.getByRole('slider').fill('60');
  await toolbar.getByRole('radio', { name: 'Red' }).click();
  await draw(page, [
    [0.2, 0.2],
    [0.6, 0.2],
  ]);
  await expect
    .poll(async () => (await elementsOf())[0])
    .toMatchObject({ tool: 'highlighter', c: '#c22a2a', o: 0.6, w: 24 });

  await tool(page, /^Shapes/);
  await toolbar.getByRole('button', { name: 'Arrow' }).click();
  await draw(page, [
    [0.2, 0.5],
    [0.5, 0.5],
  ]);
  await expect.poll(async () => (await elementsOf())[1]).toMatchObject({ k: 'h', shape: 'arrow' });

  await tool(page, /^Text/);
  await toolbar.getByRole('button', { name: 'Handwriting' }).click();
  const box = await page.getByRole('img', { name: /Page/ }).boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7);
  await page.getByRole('textbox', { name: 'Text' }).fill('F = ma');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await elementsOf())[2]).toMatchObject({ k: 't', v: 'F = ma', f: 'hand' });
});

test('eraser removes everything inside the circle', async ({ page }) => {
  await draw(page, [
    [0.45, 0.4],
    [0.55, 0.45],
  ]);
  await draw(page, [
    [0.1, 0.8],
    [0.2, 0.85],
  ]);
  await expect.poll(async () => (await elementsOf()).length).toBe(2);
  await tool(page, /^Eraser/);
  await draw(page, loop);
  await expect.poll(async () => (await elementsOf()).length).toBe(1);
});

test('lasso selects, moves, and erases; offers AI actions', async ({ page }) => {
  await draw(page, [
    [0.45, 0.4],
    [0.55, 0.45],
  ]);
  await expect.poll(async () => (await elementsOf()).length).toBe(1);
  const before = JSON.stringify(await elementsOf());
  await tool(page, /^Lasso/);
  await draw(page, loop);
  const menu = page.getByRole('toolbar', { name: '1 selected' });
  await expect(menu).toBeVisible();
  for (const name of ['Convert to text', 'Explain', 'Translate'])
    await expect(menu.getByRole('button', { name })).toBeEnabled();

  // Drag the selection.
  await draw(page, [
    [0.5, 0.42],
    [0.5, 0.7],
  ]);
  await expect.poll(async () => JSON.stringify(await elementsOf())).not.toBe(before);

  // Keyboard move, then erase from the menu.
  await draw(page, [
    [0.05, 0.05],
    [0.95, 0.05],
    [0.95, 0.85],
    [0.05, 0.85],
    [0.05, 0.05],
  ]);
  await page.getByRole('toolbar', { name: '1 selected' }).getByRole('button', { name: 'Erase' }).click();
  await expect.poll(async () => (await elementsOf()).length).toBe(0);
});

test('pages: add, navigate, and the page count is saved', async ({ page }) => {
  await page.getByRole('button', { name: 'Add page' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect
    .poll(async () => {
      const d = await notebookOf();
      return d.pageCount === 2;
    })
    .toBe(true);
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  await page.keyboard.press('PageDown');
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
});

test('switching Paged ↔ Infinite keeps all content and is saved per notebook', async ({ page }) => {
  await draw(page, [
    [0.4, 0.3],
    [0.6, 0.3],
  ]);
  await page.getByRole('button', { name: 'Add page' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await draw(page, [
    [0.4, 0.3],
    [0.6, 0.3],
  ]);
  await expect.poll(async () => (await elementsOf()).length).toBe(1);

  await page.getByRole('radio', { name: 'Infinite' }).click();
  await expect(page.getByRole('img', { name: 'Infinite canvas, 2 items' })).toBeVisible();
  await waitForNotebook((d) => d.mode === 'infinite' && d.pageCount === 1);
  expect((await elementsOf()).length).toBe(2);

  await page.reload();
  await expect(page.getByRole('radio', { name: 'Infinite' })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('radio', { name: 'Paged' }).click();
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await waitForNotebook((d) => d.mode === 'paged' && d.pageCount === 2);
});

test('paper style and background are saved per notebook', async ({ page }) => {
  await page.getByRole('button', { name: 'Paper and background' }).click();
  const panel = page.getByRole('dialog', { name: 'Paper and background' });
  await panel.getByText('Grid').click();
  await panel.locator('label', { hasText: 'Cream' }).click();
  await panel.getByRole('button', { name: 'Done' }).click();
  await waitForNotebook((d) => d.paper === 'grid' && d.background === 'cream');
});

test('toolbar docks, collapses, and remembers its position', async ({ page }) => {
  const toolbar = page.getByRole('toolbar', { name: 'Drawing tools' });
  const grip = toolbar.getByRole('button', { name: 'Move toolbar' });
  await grip.focus();
  await page.keyboard.press('ArrowRight');
  await expect(toolbar).toHaveAttribute('aria-orientation', 'vertical');
  const viewport = page.viewportSize();
  const right = await toolbar.boundingBox();
  expect((right?.x ?? 0) + (right?.width ?? 0)).toBeGreaterThan((viewport?.width ?? 0) - 40);

  // Drag the grip to the bottom edge.
  const g = await grip.boundingBox();
  if (!g || !viewport) throw new Error('no grip');
  await page.mouse.move(g.x + 10, g.y + 10);
  await page.mouse.down();
  await page.mouse.move(viewport.width / 2, viewport.height - 90, { steps: 8 });
  await page.mouse.up();
  await expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');

  await toolbar.getByRole('button', { name: 'Collapse toolbar' }).click();
  await expect(toolbar.getByRole('button', { name: 'Expand toolbar' })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Undo' })).toHaveCount(0);

  await page.reload();
  await expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
  await expect(toolbar.getByRole('button', { name: 'Expand toolbar' })).toBeVisible();
});

test('rename, focus mode, and delete from the menu', async ({ page }) => {
  await page.getByRole('button', { name: 'More options' }).click();
  await expect(page.getByRole('menuitem', { name: 'Export PDF' })).not.toHaveAttribute('aria-disabled');
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByRole('dialog', { name: 'Rename notebook' }).getByLabel('Title').fill('Laws of Motion');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Laws of Motion' })).toBeVisible();

  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Full-screen focus mode' }).click();
  await expect(page.getByRole('heading', { name: 'Laws of Motion' })).toBeHidden();
  await page.getByRole('button', { name: 'Exit focus mode' }).click();
  await expect(page.getByRole('heading', { name: 'Laws of Motion' })).toBeVisible();

  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('dialog', { name: 'Delete "Laws of Motion"?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page).toHaveURL(/\/notebooks$/);
  expect(await apiGet(page, `/api/notebooks/${notebookId}`)).toBeNull();
});

test('palm rejection: touches never draw once a stylus is in use', async ({ page }) => {
  const canvas = page.getByRole('img', { name: /Page 1 of 1/ });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  const fire = (type: string, pointerType: string, id: number, fx: number, fy: number) =>
    canvas.dispatchEvent(type, {
      pointerId: id,
      pointerType,
      isPrimary: true,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      pressure: 0.6,
      clientX: box.x + box.width * fx,
      clientY: box.y + box.height * fy,
    });
  // Stylus stroke.
  await fire('pointerdown', 'pen', 2, 0.3, 0.3);
  await fire('pointermove', 'pen', 2, 0.5, 0.35);
  await fire('pointerup', 'pen', 2, 0.5, 0.35);
  await expect.poll(async () => (await elementsOf()).length).toBe(1);
  // A resting palm (touch) afterwards must not draw.
  await fire('pointerdown', 'touch', 3, 0.6, 0.6);
  await fire('pointermove', 'touch', 3, 0.7, 0.7);
  await fire('pointerup', 'touch', 3, 0.7, 0.7);
  await page.waitForTimeout(1500);
  expect((await elementsOf()).length).toBe(1);
});

test('offline edits show Offline, then sync when back online', async ({ page, context }) => {
  await context.setOffline(true);
  await draw(page, [
    [0.3, 0.3],
    [0.6, 0.4],
  ]);
  await expect(
    page.getByRole('status').filter({ hasText: 'Server unreachable · not saved yet' }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await elementsOf()).length, { timeout: 20_000 }).toBe(1);
});

test('stays responsive with 1000+ strokes', async ({ page }) => {
  test.skip(isMobile(page), 'measured once on desktop and tablet');
  const strokes = Array.from({ length: 1200 }, (_, i) => ({
    k: 's',
    id: `s${i}`,
    tool: 'pen',
    c: '#0f2a4a',
    w: 2,
    o: 1,
    pts: packPoints(
      Array.from(
        { length: 30 },
        (_, j) => [40 + ((i * 7) % 900) + j * 2, 40 + ((i * 13) % 1300) + (j % 5)] as [number, number],
      ),
    ),
  }));
  await apiSend(page, 'PUT', `/api/notebooks/${notebookId}/pages/p0`, { index: 0, elements: strokes });
  await expect(page.getByRole('img', { name: 'Page 1 of 1, 1200 items' })).toBeVisible();

  const t0 = Date.now();
  await draw(page, [
    [0.2, 0.2],
    [0.4, 0.25],
    [0.6, 0.2],
    [0.8, 0.25],
  ]);
  await expect(page.getByRole('img', { name: 'Page 1 of 1, 1201 items' })).toBeVisible();
  const drawMs = Date.now() - t0;

  const t1 = Date.now();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.waitForTimeout(200);
  const zoomMs = Date.now() - t1 - 200;
  console.log(`PERF 1200 strokes: draw+commit ${drawMs} ms, 2x zoom ${zoomMs} ms`);
  expect(drawMs).toBeLessThan(2500);
  expect(zoomMs).toBeLessThan(1000);
  await expect.poll(async () => (await elementsOf()).length).toBe(1201);
});

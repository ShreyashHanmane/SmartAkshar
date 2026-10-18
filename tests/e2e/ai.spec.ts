import { type Page, expect, test } from '@playwright/test';
import { PDF_PAGES, makePdf } from './fixtures';
import { apiGet, createNotebookViaUi, greeting, isMobile, signUpFresh } from './helpers';

const AI_BASE = 'http://localhost:4174';

test.describe('AI turned off (no key)', () => {
  test('the panel explains how to turn AI on and disables actions', async ({ page }) => {
    await signUpFresh(page);
    await page.getByRole('button', { name: 'Ask AI' }).click();
    const panel = page.getByRole('dialog', { name: 'AI study help' });
    await expect(panel.getByText('AI is off on this computer.', { exact: false })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Explain' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });
});

test.describe('AI turned on', () => {
  test.use({ baseURL: AI_BASE });

  async function draw(page: Page, pts: [number, number][]) {
    const box = await page.getByRole('img', { name: /Page/ }).boundingBox();
    if (!box) throw new Error('no canvas');
    const at = ([x, y]: [number, number]) => [box.x + box.width * x, box.y + box.height * y] as const;
    const [sx, sy] = at(pts[0] as [number, number]);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (const p of pts.slice(1)) {
      const [x, y] = at(p);
      await page.mouse.move(x, y, { steps: 6 });
    }
    await page.mouse.up();
  }

  test('Ask AI explains pasted text, shows usage, and can cancel', async ({ page }) => {
    await signUpFresh(page);
    await page.getByRole('button', { name: 'Ask AI' }).click();
    const panel = page.getByRole('dialog', { name: 'AI study help' });
    await panel.getByRole('button', { name: 'Explain' }).click();
    await expect(panel.getByText('Type or paste something first.')).toBeVisible();
    await panel.getByLabel('Paste or type what you need help with').fill('Momentum is mass times velocity.');
    await expect(
      panel.getByText('Only this text (32 characters) is sent to Google Gemini', { exact: false }),
    ).toBeVisible();
    await panel.getByRole('button', { name: 'Explain' }).click();
    await expect(panel.getByTestId('ai-result')).toHaveText('Explanation: Momentum is mass times velocity.');
    await expect(panel.getByText('1 of 20 AI requests used today.')).toBeVisible();

    await panel.getByLabel('Paste or type what you need help with').fill('SLOW request');
    await panel.getByRole('button', { name: 'Summarize' }).click();
    await expect(panel.getByText('Working on it…')).toBeVisible();
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel.getByText('Cancelled.')).toBeVisible();
  });

  test('model output is shown as plain text, never as HTML', async ({ page }) => {
    await signUpFresh(page);
    await page.getByRole('button', { name: 'Ask AI' }).click();
    const panel = page.getByRole('dialog', { name: 'AI study help' });
    await panel.getByLabel('Paste or type what you need help with').fill('HTML please');
    await panel.getByRole('button', { name: 'Explain' }).click();
    const result = panel.getByTestId('ai-result');
    await expect(result).toHaveText('<img src=x onerror="window.__aiPwned=1"><b>bold</b>');
    expect(await result.locator('img, b').count()).toBe(0);
    expect(
      await page.evaluate(() => (window as unknown as { __aiPwned?: number }).__aiPwned),
    ).toBeUndefined();
  });

  test('AI-made flashcards can be reviewed and saved to a deck', async ({ page }) => {
    await signUpFresh(page);
    await page.getByRole('button', { name: 'Ask AI' }).click();
    const panel = page.getByRole('dialog', { name: 'AI study help' });
    await panel
      .getByLabel('Paste or type what you need help with')
      .fill('Newton’s laws relate force, mass and acceleration.');
    await panel.getByRole('button', { name: 'Make flashcards' }).click();
    await expect(panel.getByRole('checkbox')).toHaveCount(2);
    await panel.getByRole('checkbox').nth(1).uncheck();
    await panel.getByLabel('New deck name').fill('Physics AI');
    await panel.getByRole('button', { name: 'Save 1 cards' }).click();
    await expect(panel.getByRole('button', { name: 'Saved' })).toBeVisible();
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const decks =
      (await apiGet<{ title: string; total: number }[]>(page, `/api/decks?before=${end.getTime()}`)) ?? [];
    expect(decks.map((d) => [d.title, d.total])).toEqual([['Physics AI', 1]]);
  });

  test('lasso → Convert to text sends only the selection; result goes into notes', async ({ page }) => {
    await signUpFresh(page);
    const notebookId = await createNotebookViaUi(page, 'Dynamics');
    await draw(page, [
      [0.45, 0.4],
      [0.55, 0.45],
    ]);
    await page
      .getByRole('toolbar', { name: 'Drawing tools' })
      .getByRole('button', { name: /^Lasso/ })
      .click();
    await draw(page, [
      [0.35, 0.3],
      [0.65, 0.3],
      [0.65, 0.55],
      [0.35, 0.55],
      [0.35, 0.3],
    ]);
    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.url().endsWith('/api/ai/run')) requests.push(r.postData() ?? '');
    });
    await page
      .getByRole('toolbar', { name: '1 selected' })
      .getByRole('button', { name: 'Convert to text' })
      .click();
    const panel = page.getByRole('dialog', { name: 'AI study help' });
    await expect(
      panel.getByText('Only an image of the selected strokes is sent', { exact: false }),
    ).toBeVisible();
    await expect(panel.getByTestId('ai-result')).toHaveText('F = ma');
    const sent = JSON.parse(requests[0] ?? '{}') as { action?: string; image?: string; text?: string };
    expect(sent.action).toBe('handwriting');
    expect(sent.image).toMatch(/^data:image\/png;base64,/);
    expect(sent.text).toBeUndefined();

    await panel.getByRole('button', { name: 'Insert into notes' }).click();
    await expect
      .poll(async () =>
        JSON.stringify(
          (await apiGet<{ content: unknown }>(page, `/api/notebooks/${notebookId}/note`))?.content,
        ),
      )
      .toContain('F = ma');
  });

  test('reader: explain a selection, summarize the whole book, and make cards from a highlight', async ({
    page,
  }) => {
    test.skip(isMobile(page), 'text selection flows are covered on desktop and tablet');
    await signUpFresh(page);
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
    const select = () =>
      page.locator('body').evaluate((body) => {
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
    await select();
    await page
      .getByRole('toolbar', { name: 'Selected text' })
      .getByRole('button', { name: 'Explain' })
      .click();
    const panel = page.getByRole('dialog', { name: 'AI study help' });
    await expect(panel.getByTestId('ai-result')).toHaveText('Explanation: inversely');
    await panel.getByRole('button', { name: 'Close AI panel' }).click();

    await page.getByRole('button', { name: 'Summarize with AI' }).click();
    await page.getByRole('menuitem', { name: 'Summarize the whole book' }).click();
    await expect(panel.getByText('Whole book (first 12000 characters)')).toBeVisible();
    await expect(panel.getByTestId('ai-result')).toContainText('• Summary: Chapter 4');
    await panel.getByRole('button', { name: 'Close AI panel' }).click();

    await select();
    await page
      .getByRole('toolbar', { name: 'Selected text' })
      .getByRole('button', { name: 'Highlight' })
      .click();
    await page.locator('mark.akshar-hl').click({ force: true });
    await page.getByRole('button', { name: 'Make flashcards with AI' }).click();
    await expect(panel.getByRole('checkbox')).toHaveCount(2);
  });
});

test('new accounts made in the app start with starter subjects and decks', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Name', { exact: true }).fill('Asha');
  await page.getByLabel('Username').fill(`starter${Date.now().toString(36)}`);
  await page.getByLabel('Password', { exact: true }).fill('study1234');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(greeting(page, 'Asha')).toBeVisible();
  await page.goto('/flashcards');
  for (const deck of [
    'Mechanics essentials',
    'Derivatives & integrals',
    'Functional groups',
    'Freedom movement',
  ])
    await expect(page.getByRole('link', { name: deck, exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Mechanics essentials' })).toContainText(
    '4 cards · 4 due',
  );
  await page.goto('/notebooks');
  for (const subject of ['Physics', 'Mathematics', 'Chemistry', 'History'])
    await expect(
      page.getByRole('navigation', { name: 'Filter by subject' }).getByRole('link', { name: subject }),
    ).toBeVisible();
});

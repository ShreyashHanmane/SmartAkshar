import { expect, test } from '@playwright/test';
import { createNotebookViaUi, signUpFresh } from './helpers';

test('no console errors or uncaught exceptions across the main screens', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`exception: ${e.message}`));

  await signUpFresh(page);
  const id = await createNotebookViaUi(page, 'Quality check');
  await expect(page.getByRole('img', { name: /Page 1 of 1/ })).toBeVisible();
  await page.goto(`/notebooks/${id}?view=notes`);
  await expect(page.getByRole('textbox', { name: 'Notes' })).toBeVisible();
  for (const [path, heading] of [
    ['/', /Good (morning|afternoon|evening), Asha/],
    ['/notebooks', 'Notebooks'],
    ['/library', 'Library'],
    ['/flashcards', 'Flashcards'],
    ['/settings', 'Settings'],
    ['/search?q=quality', /Search/],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
  }
  await page.goto('/this-page-does-not-exist');
  await expect(page.getByRole('heading').first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('the page itself is served with the security headers', async ({ page }) => {
  const res = await page.goto('/login');
  const headers = res?.headers() ?? {};
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).not.toContain('unsafe-eval');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
});

/** DOM checks that need no extra tools: names, labels, alt text, touch-target size (CLAUDE.md §6). */
async function a11yProblems(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const name = (el: Element) =>
      (
        el.getAttribute('aria-label') ||
        (el.getAttribute('aria-labelledby') ?? '')
          .split(' ')
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join('') ||
        el.textContent ||
        el.getAttribute('title') ||
        ''
      ).trim();
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${name(el).slice(0, 30)}"`;
    for (const el of document.querySelectorAll(
      'button, a[href], [role="button"], [role="menuitem"], [role="radio"], [role="tab"]',
    )) {
      if (!visible(el)) continue;
      if (!name(el) && !el.querySelector('img[alt]:not([alt=""])')) problems.push(`no name: ${describe(el)}`);
      const r = el.getBoundingClientRect();
      // Links inside running text are exempt; everything else must be a 44 px target (WCAG 2.5.5 / CLAUDE.md §6).
      const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
      if (!inline && (r.width < 43.5 || r.height < 43.5))
        problems.push(`small target ${Math.round(r.width)}x${Math.round(r.height)}: ${describe(el)}`);
    }
    for (const el of document.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
      // Hidden pickers opened by a labelled button are fine (aria-hidden, or sr-only with a label).
      if (
        el.getAttribute('aria-hidden') === 'true' ||
        (el.classList.contains('sr-only') &&
          el.getAttribute('type') === 'file' &&
          el.getAttribute('aria-label'))
      )
        continue;
      const id = el.id;
      const labelled =
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        (id && document.querySelector(`label[for="${id}"]`)) ||
        el.closest('label');
      if (!labelled) problems.push(`unlabelled ${el.tagName.toLowerCase()}`);
    }
    for (const img of document.querySelectorAll('img'))
      if (!img.hasAttribute('alt')) problems.push(`img without alt: ${img.src.slice(-40)}`);
    return problems;
  });
}

test('basic accessibility checks on every main screen', async ({ page }) => {
  await signUpFresh(page);
  const id = await createNotebookViaUi(page, 'A11y check');
  await expect(page.getByRole('img', { name: /Page 1 of 1/ })).toBeVisible();
  const found: Record<string, string[]> = {};
  const check = async (label: string) => {
    const p = await a11yProblems(page);
    if (p.length) found[label] = [...new Set(p)];
  };
  await check('whiteboard');
  await page.goto(`/notebooks/${id}?view=notes`);
  await expect(page.getByRole('textbox', { name: 'Notes' })).toBeVisible();
  await check('notes');
  for (const path of ['/', '/notebooks', '/library', '/flashcards', '/settings', '/search?q=a']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await check(path);
  }
  expect(found).toEqual({});
});

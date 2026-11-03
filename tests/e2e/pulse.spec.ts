import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/ar/#pulse');
  await page.locator('.pulse astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  await expect(page.locator('.opt').first()).toBeEnabled();
}

test('vote first, then percentages that sum to 100, persisted across reload and tabs', async ({ page, context }) => {
  await ready(page);
  await expect(page.locator('.opts')).not.toContainText('%');
  await page.locator('.opt.a').click();
  await expect(page.locator('.opts')).toHaveClass(/voted/);
  await expect(page.locator('.opt.a')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.opt.a')).toHaveClass(/mine/);
  const pcts = await page.locator('.opt .pct').allTextContents();
  const sum = pcts.map((s) => parseInt(s, 10)).reduce((a, b) => a + b, 0);
  expect(sum).toBe(100);
  await expect(page.locator('.pulse [aria-live="polite"]').first()).toContainText('%');
  await page.reload();
  await page.locator('.pulse astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  await expect(page.locator('.opts')).toHaveClass(/voted/);
  const other = await context.newPage();
  await other.goto('/ar/#pulse');
  await other.locator('.pulse astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  await expect(other.locator('.opts')).toHaveClass(/voted/);
  await expect(other.locator('.opt.b')).toBeDisabled();
});

test('the votes line shows the running total after voting', async ({ page }) => {
  await ready(page);
  await page.locator('.opt.b').click();
  await expect(page.locator('[data-cmp]')).toContainText(/صوت/);
});

test('the serious poll records a vote and promises an answer', async ({ page }) => {
  await ready(page);
  await page.locator('.serious').getByRole('button', { name: /^نعم/ }).click();
  await expect(page.locator('.serious .msg')).toContainText('وصل صوتك');
  await expect(page.locator('.serious').getByRole('button', { name: /^لا/ })).toBeDisabled();
  await expect(page.locator('.serious').getByRole('button', { name: /^نعم/ })).toContainText('%');
});

test('reduced motion removes the bar travel', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  const prop = await page.locator('.opt.a .fill').evaluate((el) => getComputedStyle(el).transitionProperty);
  expect(prop).not.toContain('transform');
});

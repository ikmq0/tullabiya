import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/ar/#pulse');
  await page.locator('#pulse astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  await expect(page.locator('#pulse .opt').first()).toBeEnabled();
}

test('vote first, then percentages that sum to 100, persisted across reload and tabs', async ({ page, context }) => {
  await ready(page);
  await expect(page.locator('#pulse .opts')).not.toContainText('%');
  await page.locator('#pulse .opt.a').click();
  await expect(page.locator('#pulse .opts')).toHaveClass(/voted/);
  await expect(page.locator('#pulse .opt.a')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#pulse .opt.a')).toHaveClass(/mine/);
  const pcts = await page.locator('#pulse .opt .pct').allTextContents();
  const sum = pcts.map((s) => parseInt(s, 10)).reduce((a, b) => a + b, 0);
  expect(sum).toBe(100);
  await expect(page.locator('#pulse [aria-live="polite"]').first()).toContainText('%');
  await page.reload();
  await page.locator('#pulse astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  await expect(page.locator('#pulse .opts')).toHaveClass(/voted/);
  const other = await context.newPage();
  await other.goto('/ar/#pulse');
  await other.locator('#pulse astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  await expect(other.locator('#pulse .opts')).toHaveClass(/voted/);
  await expect(other.locator('#pulse .opt.b')).toBeDisabled();
});

test('the votes line shows the total after voting, and it does not move by itself', async ({ page }) => {
  await ready(page);
  await page.locator('#pulse .opt.b').click();
  const line = page.locator('#pulse [data-cmp]');
  await expect(line).toContainText(/صوت/);
  await expect(page.locator('.live')).toHaveCount(0);
  const before = await line.textContent();
  const pcts = await page.locator('#pulse .opt .pct').allTextContents();
  // Longer than the simulation's tick, with the poll in view.
  await page.waitForTimeout(6000);
  await expect(line).toHaveText(before!);
  expect(await page.locator('#pulse .opt .pct').allTextContents()).toEqual(pcts);
});

test('the serious poll hides its split until the vote, records it and promises an answer', async ({ page }) => {
  await ready(page);
  await expect(page.locator('.serious .row-btns')).not.toContainText('%');
  await page.locator('.serious').getByRole('button', { name: /^نعم/ }).click();
  await expect(page.locator('.serious .msg')).toContainText('وصل صوتك');
  await expect(page.locator('.serious').getByRole('button', { name: /^لا/ })).toBeDisabled();
  await expect(page.locator('.serious').getByRole('button', { name: /^نعم/ })).toContainText('%');
});

test('reduced motion removes the bar travel', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  const prop = await page.locator('#pulse .opt.a .fill').evaluate((el) => getComputedStyle(el).transitionProperty);
  expect(prop).not.toContain('transform');
});

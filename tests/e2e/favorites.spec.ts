import { test, expect, type Page } from '@playwright/test';
import { hydrated } from './helpers';

/** Applies the first demo persona (عبدالله: follows srt and sac, pins guest and contributions). */
async function persona(page: Page) {
  await page.goto('/ar/?demo=1');
  await hydrated(page, '.me-chip');
  await page.locator('.me-chip').click();
  await page.getByRole('button', { name: 'عبدالله' }).click();
  await expect(page.locator('.me-chip')).toContainText('عبدالله');
}

test('without favorites the band invites, and the toggle is off', async ({ page }) => {
  await page.goto('/ar/');
  await hydrated(page, '.favs-in');
  await expect(page.locator('.favs-items')).toHaveAttribute('data-following', 'false');
  await expect(page.locator('.favs-items .favs-empty')).toContainText('تابع جهة');
  await expect(page.locator('.favs-items .chip.foryou')).toBeDisabled();
});

test('following publishers fills the band, marks their rows, and the toggle dims the rest', async ({ page }) => {
  await persona(page);
  await expect(page.locator('.favs-items')).toHaveAttribute('data-following', 'true');
  await expect(page.locator('.fav-list li')).toHaveCount(4);
  await expect(page.locator('.opp .row[data-fy="1"]').first()).toBeVisible();
  await expect(page.locator('.opp .row[data-fy="1"] .fy-mark').first()).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-foryou', '');
  await page.locator('.favs-items .chip.foryou').click();
  await expect(page.locator('html')).toHaveAttribute('data-foryou', '');
  const dimmed = page.locator('[data-fy="0"]:not([data-nodim])').first();
  await expect(dimmed).toHaveCSS('opacity', '0.38');
  await page.reload();
  await hydrated(page, '.favs-in');
  await expect(page.locator('html')).toHaveAttribute('data-foryou', '');
  await expect(page.locator('.favs-items .chip.foryou')).toHaveAttribute('aria-pressed', 'true');
});

test('the opportunities page hides rows outside your favorites when the toggle is on', async ({ page }) => {
  await persona(page);
  await page.goto('/ar/opportunities/');
  await hydrated(page, '.opp');
  const rows = page.locator('.opp .row');
  const all = await rows.count();
  expect(all).toBeGreaterThan(3);
  await page.locator('.opp .chip.foryou').click();
  await expect(page.locator('html')).toHaveAttribute('data-foryou', '');
  await expect(page.locator('.opp .row[data-fy="0"]').first()).toBeHidden();
  await expect(page.locator('.opp .row[data-fy="1"]').first()).toBeVisible();
  await page.locator('.opp .chip.foryou').click();
  await expect(page.locator('.opp .row[data-fy="0"]').first()).toBeVisible();
});

test('a publisher can be followed from its chip in a story', async ({ page }) => {
  await page.goto('/ar/');
  await hydrated(page, '.favs-in');
  const story = page.locator('.side-story').first();
  await story.scrollIntoViewIfNeeded();
  await page.locator('.side-story astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  const chip = story.locator('.chip-wrap .btn').first();
  await chip.click();
  await page.locator('.side-story .popover[data-open="true"] .menu-item.follow').click();
  await expect(page.locator('.side-story .popover[data-open="true"] .menu-item.follow')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.favs-items')).toHaveAttribute('data-following', 'true');
  await expect(page.locator('.side-story[data-fy="1"]').first()).toBeVisible();
});

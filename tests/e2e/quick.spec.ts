import { test, expect } from '@playwright/test';
import { hydrated } from './helpers';

test('the hero link opens the 5-minute version with one slab per section and a minutes-left line', async ({ page }) => {
  await page.goto('/ar/');
  await page.locator('.hero-cta a', { hasText: 'نسخة الخمس دقائق' }).click();
  await expect(page).toHaveURL(/\/ar\/quick\/$/);
  await expect(page.locator('h1')).toContainText('نسخة الخمس دقائق');
  await expect(page.locator('.qs')).toHaveCount(6);
  await hydrated(page, '.quick-line');
  await expect(page.locator('.quick-line')).toContainText('5 دقائق متبقية');
  await expect(page.locator('.quick-line')).toHaveAttribute('data-done', 'false');
});

test('reaching the end records the digest and the line turns', async ({ page }) => {
  await page.goto('/ar/quick/');
  await hydrated(page, '.quick-line');
  await page.locator('.quick-end').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 600);
  await expect(page.locator('.quick-line')).toHaveAttribute('data-left', '0');
  await expect(page.locator('.quick-line')).toHaveAttribute('data-done', 'true');
  await expect(page.locator('.quick-line')).toContainText('خلصت');
  await page.reload();
  await hydrated(page, '.quick-line');
  await expect(page.locator('.quick-line')).toHaveAttribute('data-done', 'true');
});

test('pinned sections come first', async ({ page }) => {
  await page.goto('/ar/?demo=1');
  await hydrated(page, '.me-chip');
  await page.locator('.me-chip').click();
  await page.getByRole('button', { name: 'عبدالله' }).click();
  await expect(page.locator('.me-chip')).toContainText('عبدالله');
  await page.goto('/ar/quick/');
  await hydrated(page, '.quick-line');
  await expect(page.locator('.qs').first()).toHaveAttribute('data-section', 'guest');
  await expect(page.locator('.qs').last()).not.toHaveAttribute('data-section', 'guest');
  await expect(page.locator('.quick-end')).toBeVisible();
});

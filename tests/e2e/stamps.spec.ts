import { test, expect } from '@playwright/test';
import { hydrated } from './helpers';

test('the first vote earns a stamp: a toast now, the mark in My Corner after', async ({ page }) => {
  await page.goto('/ar/');
  await hydrated(page, '.pulse');
  await page.locator('.opt.a').scrollIntoViewIfNeeded();
  await page.locator('.opt.a').click();
  const toast = page.locator('.toast[data-open="true"]');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveAttribute('data-stamp', 'votes-1');
  await expect(toast).toContainText('ختم جديد');
  await expect(toast).toContainText('أصوات النبض');
  await page.goto('/ar/my/');
  await hydrated(page, '.my');
  await expect(page.locator('.stamp[data-id="votes-1"]')).toHaveAttribute('data-on', 'true');
  await expect(page.locator('.stamp[data-id="hunts-1"]')).toHaveAttribute('data-on', 'false');
});

test('reading the magazine in both languages earns a stamp on the second language', async ({ page }) => {
  await page.goto('/ar/');
  await hydrated(page, '.hero');
  await expect(page.locator('.toast')).toHaveAttribute('data-open', 'false');
  await page.goto('/en/');
  await hydrated(page, '.hero');
  const toast = page.locator('.toast[data-open="true"]');
  await expect(toast).toHaveAttribute('data-stamp', 'langs-2');
  await expect(toast).toContainText('Languages · 2 languages');
});

test('a demo persona with four complete issues and two follows holds three stamps', async ({ page }) => {
  await page.goto('/ar/?demo=1');
  await hydrated(page, '.me-chip');
  await page.locator('.me-chip').click();
  await page.getByRole('button', { name: 'عبدالله' }).click();
  await expect(page.locator('.me-chip')).toContainText('عبدالله');
  await page.goto('/ar/my/');
  await hydrated(page, '.my');
  await expect(page.locator('.stamp[data-id="issues-3"]')).toHaveAttribute('data-on', 'true');
  await expect(page.locator('.stamp[data-on="true"]')).toHaveCount(3);
  await expect(page.locator('.level')).toHaveAttribute('data-level', '2');
  await expect(page.locator('.stamp[data-id="issues-50"] small.reward')).toContainText('يُكافأ');
});

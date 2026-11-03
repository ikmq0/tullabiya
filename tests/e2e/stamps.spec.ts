import { test, expect } from '@playwright/test';
import { hydrated } from './helpers';

test('the first vote earns a stamp without announcing it; the mark is in My Corner', async ({ page }) => {
  await page.goto('/ar/#pulse');
  await hydrated(page, '#pulse');
  await page.locator('#pulse .opt.a').click();
  await expect(page.locator('#pulse .opts')).toHaveClass(/voted/);
  await page.waitForTimeout(400);
  await expect(page.locator('.toast, [data-stamp]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('ختم جديد');
  await page.goto('/ar/my/');
  await hydrated(page, '.my');
  await expect(page.locator('.stamp[data-id="first-vote"]')).toHaveAttribute('data-on', 'true');
  await expect(page.locator('.stamp[data-id="first-solve"]')).toHaveAttribute('data-on', 'false');
});

test('reading the magazine in both languages earns a stamp, quietly, on the second language', async ({ page }) => {
  await page.goto('/ar/');
  await hydrated(page, '.hero');
  await page.goto('/en/');
  await hydrated(page, '.hero');
  await page.waitForTimeout(400);
  await expect(page.locator('.toast, [data-stamp]')).toHaveCount(0);
  await page.goto('/en/my/');
  await hydrated(page, '.my');
  await expect(page.locator('.stamp[data-id="both-languages"]')).toHaveAttribute('data-on', 'true');
  await expect(page.locator('.stamp[data-id="both-languages"]')).toContainText('Two languages');
});

test('a demo persona with four issues in a row already holds the streak stamp', async ({ page }) => {
  await page.goto('/ar/?demo=1');
  await hydrated(page, '.me-chip');
  await page.locator('.me-chip').click();
  await page.getByRole('button', { name: 'عبدالله' }).click();
  await expect(page.locator('.me-chip')).toContainText('عبدالله');
  await page.goto('/ar/my/');
  await hydrated(page, '.my');
  await expect(page.locator('.stamp[data-id="three-issues"]')).toHaveAttribute('data-on', 'true');
  await expect(page.locator('.stamp[data-on="true"]')).toHaveCount(1);
});

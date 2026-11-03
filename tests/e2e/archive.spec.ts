import { test, expect } from '@playwright/test';
import { hydrated } from './helpers';

test('the wall shows 22 issues and the current one opens a viewer with arrow keys', async ({ page }) => {
  await page.goto('/ar/archive/');
  await expect(page.locator('.wall .iss')).toHaveCount(22);
  await page.locator('.wall .iss', { hasText: /^21/ }).click();
  await expect(page).toHaveURL(/\/ar\/archive\/21\/$/);
  await hydrated(page, '.viewer');
  await expect(page.locator('.viewer-stage img')).toHaveAttribute('data-page', '1');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.viewer-stage img')).toHaveAttribute('data-page', '2');
  await page.getByRole('button', { name: 'الصفحة السابقة' }).click();
  await expect(page.locator('.viewer-stage img')).toHaveAttribute('data-page', '1');
  await expect(page.locator('.thumb')).toHaveCount(8);
  await expect(page.locator('.toc a')).toHaveCount(18);
});

test('the PDF download responds with a PDF', async ({ page }) => {
  const res = await page.request.get('/archive/21/issue.pdf');
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('pdf');
});

// Every issue is ingested here; the remote fallback for a clone without the files is covered by
// tests/unit/onDisk.test.ts.
test('an ingested back issue serves its own pages and PDF', async ({ page }) => {
  await page.goto('/en/archive/20/');
  await expect(page.locator('h1')).toContainText('Issue 20');
  await expect(page.locator('a', { hasText: 'Download PDF' })).toHaveAttribute('href', '/archive/20/issue.pdf');
  await expect(page.locator('.viewer')).toHaveCount(1);
  await expect(page.locator('.issue-head')).toContainText('8 pages');
  const res = await page.request.get('/archive/20/p08.jpg');
  expect(res.ok()).toBe(true);
});

test('search finds the Murshid story and says so when nothing matches', async ({ page }) => {
  await page.goto('/ar/archive/');
  await hydrated(page, '.searchbox');
  await page.locator('#arch-q').fill('الإرشاد');
  await page.getByRole('button', { name: 'ابحث' }).click();
  await expect(page.locator('.results')).toBeVisible();
  await expect(page.locator('.results li a', { hasText: 'الإرشاد' }).first()).toBeVisible();
  await page.locator('#arch-q').fill('xqzv-nothing');
  await page.getByRole('button', { name: 'ابحث' }).click();
  await expect(page.locator('.results-empty')).toBeVisible();
});

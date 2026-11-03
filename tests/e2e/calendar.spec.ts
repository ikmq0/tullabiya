import { test, expect } from '@playwright/test';
import { captureDownloads, hydrated, lastDownload } from './helpers';

test('filtering by kind narrows the list and clears back', async ({ page }) => {
  await page.goto('/ar/calendar/');
  await hydrated(page, '.cal-page');
  await page.getByRole('button', { name: 'قائمة' }).click();
  await expect(page.locator('.cal-list')).toHaveAttribute('data-count', '7');
  await page.locator('.cal-filter select').selectOption('career');
  await expect(page.locator('.cal-list')).toHaveAttribute('data-count', '3');
  await page.locator('.cal-filter select').selectOption('competition');
  await expect(page.locator('.cal-list')).toHaveAttribute('data-count', '1');
  await page.locator('.cal-filter select').selectOption('all');
  await expect(page.locator('.cal-list')).toHaveAttribute('data-count', '7');
});

test('add all downloads one file with every event', async ({ page }) => {
  await captureDownloads(page);
  await page.goto('/ar/calendar/');
  await hydrated(page, '.cal-page');
  await page.getByRole('button', { name: 'أضف كل فعاليات الشهر' }).click();
  const { name, body } = await lastDownload(page);
  expect(name).toBe('tullabiya-2026-09.ics');
  expect((body.match(/BEGIN:VEVENT/g) ?? []).length).toBe(7);
  expect(body).toContain('X-WR-CALNAME');
});

test('the grid shows September starting on a Tuesday and a day selection filters the list', async ({ page }) => {
  await page.goto('/en/calendar/');
  await hydrated(page, '.cal-page');
  await page.getByRole('button', { name: 'Grid' }).click();
  const cells = page.locator('.cal-grid .cal-row').nth(1).locator('[role="gridcell"]');
  await expect(cells.nth(2)).toContainText('1');
  await page.locator('.cal-cell.has', { hasText: '15' }).click();
  await expect(page.locator('.cal-list')).toHaveAttribute('data-count', '1');
  await expect(page.locator('.cal-list h3')).toContainText('BCG');
});

test('subscribe offers a webcal link and the feed downloads', async ({ page }) => {
  await page.goto('/ar/calendar/#subscribe');
  await hydrated(page, '.cal-page');
  await expect(page.locator('.subscribe a[href^="webcal://"]')).toBeVisible();
  const res = await page.request.get('/calendar/ar.ics');
  expect(res.headers()['content-type']).toContain('text/calendar');
  expect(await res.text()).toContain('BEGIN:VEVENT');
});

test('the opportunities page shows days left relative to the demo clock', async ({ page }) => {
  await page.goto('/ar/opportunities/?now=2026-09-12');
  await hydrated(page, '.opp');
  const bcg = page.locator('.row', { hasText: 'BCG' });
  await bcg.scrollIntoViewIfNeeded();
  await expect(bcg.locator('.left')).toContainText('3 أيام');
  await page.goto('/ar/opportunities/?now=2026-09-16');
  await hydrated(page, '.opp');
  const bcg2 = page.locator('.row', { hasText: 'BCG' });
  await bcg2.scrollIntoViewIfNeeded();
  await expect(bcg2.locator('.left')).toContainText('انتهت');
  const reg = page.locator('.row', { hasText: 'Career Talks' }).last().getByRole('button', { name: /سجّل|تم تسجيلك/ });
  await reg.click();
  await expect(reg).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await hydrated(page, '.opp');
  await expect(page.locator('.row', { hasText: 'Career Talks' }).last().getByRole('button', { name: 'تم تسجيلك' })).toBeVisible();
});

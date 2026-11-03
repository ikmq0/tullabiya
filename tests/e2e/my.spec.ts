import { test, expect, type Page } from '@playwright/test';
import { captureDownloads, hydrated, lastDownload } from './helpers';

const STORIES = [
  '/ar/issue/21/orientation-2026/',
  '/ar/issue/21/guest-badr-alhumaidi/',
  '/ar/issue/21/musab-the-message-that-changed-the-path/',
  '/ar/issue/21/letter-to-the-class-of-2026/',
  '/ar/issue/21/caption-this-photo/',
];

async function readToEnd(page: Page, url: string) {
  await page.goto(url);
  await page.locator('.story-end').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 600);
  await expect(page.locator('.read-progress')).toHaveAttribute('aria-valuenow', /9\d|100/);
}

test('finishing the issue lights its tile and shows the end of issue', async ({ page }) => {
  test.setTimeout(90_000);
  for (const url of STORIES) await readToEnd(page, url);
  await page.goto('/ar/#pulse');
  await hydrated(page, '.pulse');
  await page.locator('.opt.a').click();
  await page.locator('#hunt').scrollIntoViewIfNeeded();
  await hydrated(page, '.hunt');
  await page.locator('#hunt-answer').fill('x');
  await page.locator('.answer button').click();
  await expect(page.locator('.hunt-msg')).toContainText('ليست');
  await page.locator('section.end').scrollIntoViewIfNeeded();
  await expect(page.locator('section.end')).toHaveAttribute('data-done', 'true');
  await expect(page.locator('section.end')).toContainText('نهاية العدد');
  await page.goto('/ar/my/');
  await hydrated(page, '.my');
  await expect(page.locator('.my .iss', { hasText: /^21/ })).toHaveClass(/lit/);
});

test('export is JSON with the profile; reset clears everything', async ({ page }) => {
  await captureDownloads(page);
  await page.goto('/ar/');
  await page.locator('.hero astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  await page.locator('astro-island:has(.sheet-root):not([ssr])').first().waitFor({ state: 'attached' });
  await page.locator('.hero-invite button').click();
  await page.getByLabel('اسمك').fill('سعد');
  await page.getByLabel('اسمك').press('Enter');
  await expect(page.locator('h1')).toContainText('سعد');
  await page.goto('/ar/my/');
  await hydrated(page, '.my');
  await expect(page.locator('.my-name')).toHaveText('سعد');
  await page.getByRole('button', { name: 'صدّر بياناتك' }).click();
  const { name, body } = await lastDownload(page);
  expect(name).toBe('tullabiya-data.json');
  expect(JSON.parse(body).profile.name).toBe('سعد');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'امسح كل شيء' }).click();
  await expect(page.locator('[data-reset-note]')).toContainText('تم المسح');
  await page.goto('/ar/');
  await expect(page.locator('h1')).toContainText('هذا شهرك في الجامعة');
});

test('saved stories appear in My Corner', async ({ page }) => {
  await page.goto(STORIES[2]);
  await hydrated(page, '.story-actions');
  await page.getByRole('button', { name: /احفظ|محفوظ/ }).click();
  await page.goto('/ar/my/');
  await hydrated(page, '.my');
  await expect(page.locator('[data-saved="1"] a')).toContainText('مصعب');
});

import { test, expect } from '@playwright/test';
import { hydrated } from './helpers';

const MUSAB = '/ar/issue/21/musab-the-message-that-changed-the-path/';

test('reading to the end marks the section and the home progress line moves', async ({ page }) => {
  await page.goto(MUSAB);
  await expect(page.locator('h1')).toContainText('مصعب');
  await page.locator('.story-end').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 400);
  await expect(page.locator('.read-progress')).toHaveAttribute('aria-valuenow', /9\d|100/);
  await page.goto('/ar/');
  await page.locator('section.end').scrollIntoViewIfNeeded();
  await expect(page.locator('section.end')).toContainText('1 من 5');
});

test('selecting a sentence offers a share card; without Web Share it downloads a PNG', async ({ page }) => {
  await page.goto(MUSAB);
  await hydrated(page, '[data-share-note]');
  await page.evaluate(() => {
    const p = document.querySelector('.story-body p')!;
    const sel = document.getSelection()!;
    sel.removeAllRanges();
    const r = document.createRange();
    r.selectNodeContents(p);
    sel.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  });
  const float = page.locator('.share-float');
  await expect(float).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), float.click()]);
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  await expect(page.locator('[data-share-note]')).toContainText('البطاقة');
});

test('renderShareCard returns a 1080x1350 PNG, personalized only with a profile', async ({ page }) => {
  await page.goto(MUSAB);
  await hydrated(page, '.story-actions');
  await page.waitForFunction(() => !!window.__tullabiya);
  const anon = await page.evaluate(async () => {
    const r = await window.__tullabiya!.renderShareCard({ kind: 'quote', quote: 'جملة للتجربة', source: 'مصدر', issueLine: 'العدد 21', lang: 'ar', profile: null });
    return { ...r.meta, type: r.blob.type, size: r.blob.size };
  });
  expect(anon).toMatchObject({ width: 1080, height: 1350, personalized: false, type: 'image/png' });
  expect(anon.size).toBeGreaterThan(5000);
  const mine = await page.evaluate(async () => {
    const r = await window.__tullabiya!.renderShareCard({ kind: 'quote', quote: 'جملة', source: 'مصدر', issueLine: 'العدد 21', lang: 'ar', profile: { name: 'ريم', color: 'aqua', address: 'f' } });
    return r.meta.personalized;
  });
  expect(mine).toBe(true);
});

test('a story without English shows the Arabic body with a note, and the printed page', async ({ page }) => {
  await page.goto('/en/issue/21/on-the-greens-algeria/');
  await expect(page.locator('[data-fallback]')).toBeVisible();
  await expect(page.locator('.story-body')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('.story-body')).toContainText('الخُضر');
  await expect(page.locator('.printed img')).toHaveAttribute('src', /\/archive\/21\/p06\.jpg/);
});

test('save for later toggles and persists', async ({ page }) => {
  await page.goto(MUSAB);
  await hydrated(page, '.story-actions');
  const save = page.getByRole('button', { name: /احفظ|محفوظ/ });
  await save.click();
  await expect(save).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await hydrated(page, '.story-actions');
  await expect(page.getByRole('button', { name: 'محفوظ' })).toHaveAttribute('aria-pressed', 'true');
});

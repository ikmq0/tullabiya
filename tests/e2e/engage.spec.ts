import { test, expect, type Page } from '@playwright/test';

const MUSAB = '/ar/issue/21/musab-the-message-that-changed-the-path/';

async function deck(page: Page, lang: 'ar' | 'en') {
  await page.goto(`/${lang}/#guest`);
  await page.locator('#guest').scrollIntoViewIfNeeded();
  await page.locator('.guest astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  await expect(page.locator('[data-count]')).toContainText('1');
  await page.locator('.deck').focus();
}

test('ArrowLeft advances in Arabic, ArrowRight in English', async ({ page }) => {
  await deck(page, 'ar');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-count]')).toContainText('2 من 30');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-count]')).toContainText('1 من 30');
  await deck(page, 'en');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-count]')).toContainText('2 of 30');
});

test('the deck buttons cycle through all thirty cards', async ({ page }) => {
  await deck(page, 'ar');
  await page.getByRole('button', { name: 'السابق' }).click();
  await expect(page.locator('[data-count]')).toContainText('30 من 30');
  await page.getByRole('button', { name: 'التالي' }).click();
  await expect(page.locator('[data-count]')).toContainText('1 من 30');
});

test('a reader answer goes to review; an empty one is refused', async ({ page }) => {
  await deck(page, 'ar');
  await page.locator('.deck .yours button').click();
  await expect(page.locator('.deck [data-note]')).toContainText('اكتب شيئاً');
  await page.locator('.deck .yours input').fill('القهوة طبعاً');
  await page.locator('.deck .yours button').click();
  await expect(page.locator('.deck [data-note]')).toContainText('هيئة التحرير');
  await expect(page.locator('.deck .yours input')).toHaveValue('');
});

test('a reaction toggles and persists', async ({ page }) => {
  await page.goto(MUSAB);
  const first = page.locator('.story-actions .react').first();
  await first.scrollIntoViewIfNeeded();
  await expect(first).toBeEnabled();
  const before = parseInt((await first.locator('.n').textContent()) ?? '0', 10);
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(first.locator('.n')).toHaveText(String(before + 1));
  await page.reload();
  const again = page.locator('.story-actions .react').first();
  await again.scrollIntoViewIfNeeded();
  await expect(again).toHaveAttribute('aria-pressed', 'true');
  await expect(again.locator('.n')).toHaveText(String(before + 1));
});

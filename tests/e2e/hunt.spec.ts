import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page, query = '') {
  await page.goto(`/ar/${query}#hunt`);
  await page.locator('#hunt').scrollIntoViewIfNeeded();
  await page.locator('.hunt astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  await expect(page.locator('.hunt-stats')).toBeVisible();
}

test('clues drop weekly: two are open on the demo day, the third is announced, a wrong answer unlocks nothing', async ({ page }) => {
  await ready(page);
  await expect(page.locator('.hunt-prog')).toContainText('2 من 3');
  await expect(page.locator('[data-next-clue]')).toContainText('الدليل 3');
  await expect(page.locator('[data-next-clue]')).toContainText('15');
  await page.locator('#hunt-answer').fill('المكتبة');
  await page.locator('.answer button').click();
  await expect(page.locator('.hunt-msg')).toContainText('ليست هي');
  await expect(page.locator('.hunt-prog')).toContainText('2 من 3');
  await expect(page.locator('.hunt .clue img')).toBeVisible();
});

test('a correct answer typed with diacritics reveals the code, which survives reload', async ({ page }) => {
  await ready(page);
  await page.locator('#hunt-answer').fill('حُرُوفُ الجَامِعَة');
  await page.locator('.answer button').click();
  await expect(page.locator('[data-code]')).toHaveText(/^KFUPM-[A-Z]{4}$/);
  await expect(page.locator('.hunt-msg.ok')).toContainText('من أول عشرة');
  const code = await page.locator('[data-code]').textContent();
  await page.reload();
  await page.locator('.hunt astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  await expect(page.locator('[data-code]')).toHaveText(code!);
  await expect(page.locator('#hunt-answer')).toHaveCount(0);
});

test('after the closing date the form is replaced by a closed message', async ({ page }) => {
  await ready(page, '?now=2026-09-21');
  await expect(page.locator('#hunt-answer')).toHaveCount(0);
  await expect(page.locator('.hunt-msg')).toContainText('أُغلق');
});

test('an empty answer costs nothing', async ({ page }) => {
  await ready(page);
  await page.locator('.answer button').click();
  await expect(page.locator('.hunt-msg')).toContainText('اكتب إجابتك');
  await expect(page.locator('.hunt-prog')).toContainText('2 من 3');
});

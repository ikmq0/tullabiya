import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page, query = '') {
  await page.goto(`/ar/${query}#hunt`);
  await page.locator('#hunt').scrollIntoViewIfNeeded();
  await page.locator('.hunt astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  await expect(page.locator('.hunt-stats')).toBeVisible();
}

test('hints drop weekly: week 2 on the demo day, and the week picker shows each week', async ({ page }) => {
  await ready(page);
  await expect(page.locator('.hunt-prog')).toContainText('2 من 3');
  await expect(page.locator('.hunt-hints li')).toHaveCount(2);
  await expect(page.locator('[data-next-clue]')).toContainText('التلميح 3');
  await expect(page.locator('[data-next-clue]')).toContainText('15');
  await expect(page.locator('.hunt .clue img')).toBeVisible();
  await page.getByRole('button', { name: 'الأسبوع 1' }).click();
  await expect(page.locator('.hunt-hints li')).toHaveCount(1);
  await expect(page.locator('.hunt .clue.locked')).toHaveCount(1);
  await expect(page.locator('[data-next-clue]')).toContainText('التلميح 2');
  await page.getByRole('button', { name: 'الأسبوع 3' }).click();
  await expect(page.locator('.hunt-hints li')).toHaveCount(3);
  await expect(page.locator('[data-next-clue]')).toHaveCount(0);
});

test('"I found it" takes a name, names the winner with a pickup code, and survives reload', async ({ page }) => {
  await ready(page);
  await page.locator('.hunt .found').click();
  await page.locator('#hunt-name').press('Enter');
  await expect(page.locator('.hunt .claim .hunt-msg')).toContainText('اكتب اسمك');
  await page.locator('#hunt-name').fill('نورة العتيبي');
  await page.locator('.hunt .claim button[type="submit"]').click();
  await expect(page.locator('[data-winner]')).toContainText('نورة العتيبي');
  await expect(page.locator('[data-code]')).toHaveText(/^KFUPM-[A-Z]{4}$/);
  const code = await page.locator('[data-code]').textContent();
  await expect(page.locator('.toast[data-open="true"]')).toHaveAttribute('data-stamp', 'hunts-1');
  await page.reload();
  await ready(page);
  await expect(page.locator('[data-winner]')).toContainText('نورة العتيبي');
  await expect(page.locator('[data-code]')).toHaveText(code!);
  await expect(page.locator('.hunt .found')).toHaveCount(0);
});

test('after closing day the hunt says so', async ({ page }) => {
  await ready(page, '?now=2026-09-22');
  await expect(page.locator('.hunt-msg')).toContainText('أُغلق');
  await expect(page.locator('.hunt .found')).toHaveCount(0);
});

import { test, expect, type Page } from '@playwright/test';
import { expectNoHorizontalScroll } from './helpers';

async function openSheet(page: Page) {
  // Astro drops the `ssr` attribute once an island has hydrated.
  await page.locator('.hero astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  await page.locator('astro-island:has(.sheet-root):not([ssr])').first().waitFor({ state: 'attached' });
  await page.locator('.hero-invite button').click();
  await expect(page.locator('.sheet-root[data-open="true"]')).toBeVisible();
  // let the 420ms slide finish so clicks land on a resting sheet
  await page.locator('.sheet').evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined))));
}

async function h1Lines(page: Page) {
  return page.locator('h1').evaluate((el) => {
    const cs = getComputedStyle(el);
    return el.getBoundingClientRect().height / parseFloat(cs.lineHeight);
  });
}

test('first visit is generic; the hero invites; skipping keeps it generic', async ({ page }) => {
  await page.goto('/ar/');
  await expect(page.locator('h1')).toContainText('هذا شهرك في الجامعة');
  await expect(page.locator('.sheet-root')).toHaveAttribute('data-open', 'false');
  await openSheet(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet-root')).toHaveAttribute('data-open', 'false');
  await expect(page.locator('h1')).toContainText('هذا شهرك في الجامعة');
});

test('completing the sheet personalizes the hero and chip, persists, and gendered copy follows', async ({ page }) => {
  await page.goto('/ar/');
  await openSheet(page);
  await page.getByLabel('اسمك').fill('ريم');
  await page.getByText('فيروزي فاتح').click();
  await page.locator('.sheet').getByRole('button', { name: 'إدارة توظيف وتدريب الطلاب' }).click();
  await page.getByText('بصيغة المؤنث').click();
  await page.locator('.sheet').getByRole('button', { name: 'ضيف الثلاثين' }).click();
  await page.getByRole('button', { name: 'احفظ' }).click();
  await expect(page.locator('.sheet-root')).toHaveAttribute('data-open', 'false');
  await expect(page.locator('h1')).toContainText('ريم');
  await expect(page.locator('h1')).toContainText('هذا شهرك');
  await expect(page.locator('.me-chip')).toContainText('ريم');
  await expect(page.locator('.favs-in .chip.pin[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('.legend')).toContainText('من جهاتك المفضلة');
  await expect(page.locator('.day.mine')).toHaveCount(3);
  await page.reload();
  await expect(page.locator('h1')).toContainText('ريم');
  await expect(page.locator('.progress strong')).toContainText('قرأتِ');
});

test('empty name is rejected and a non-image photo shows an error', async ({ page }) => {
  await page.goto('/ar/');
  await openSheet(page);
  await page.getByLabel('اسمك').press('Enter');
  await expect(page.locator('.form-err')).toContainText('اكتب اسمك');
  await page.locator('#ob-photo').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.locator('.form-err')).toContainText('صورة');
  await expect(page.locator('.sheet-photo img')).toHaveCount(0);
});

for (const name of ['A', 'عبدالعزيزعبدالرحمنعبداللهالفلانيالطويلجداجداجداجداجداجداجدا', 'Sara الطالبة']) {
  test(`name "${name.slice(0, 12)}" keeps the hero within two lines without overflow`, async ({ page }) => {
    await page.goto('/ar/');
    await openSheet(page);
    await page.getByLabel('اسمك').fill(name);
    await page.getByLabel('اسمك').press('Enter');
    await expect(page.locator('.sheet-root')).toHaveAttribute('data-open', 'false');
    expect(await h1Lines(page)).toBeLessThanOrEqual(2.2);
    await expectNoHorizontalScroll(page);
    await expect(page.locator('.me-chip .av')).toBeVisible();
  });
}

test('the sheet stays closed after the first story is read; only the button opens it', async ({ page }) => {
  await page.goto('/ar/issue/21/musab-the-message-that-changed-the-path/');
  await page.locator('astro-island:has(.sheet-root):not([ssr])').first().waitFor({ state: 'attached' });
  await page.locator('.story-end').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(600);
  await expect(page.locator('.sheet-root')).toHaveAttribute('data-open', 'false');
  await page.locator('astro-island:has(.me-chip):not([ssr])').first().waitFor({ state: 'attached' });
  await page.locator('.me-chip').click();
  await page.locator('.pop-wrap .menu-item').first().click();
  await expect(page.locator('.sheet-root')).toHaveAttribute('data-open', 'true');
});

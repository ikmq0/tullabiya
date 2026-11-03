import { test, expect } from '@playwright/test';
import { hydrated } from './helpers';

test('the video story shows a poster on the home and loads the player only on tap', async ({ page }) => {
  await page.goto('/ar/');
  const card = page.locator('.side-story', { hasText: 'يوم الأبحاث' });
  await card.scrollIntoViewIfNeeded();
  await hydrated(page, '.video');
  await expect(card.locator('.video img')).toHaveAttribute('src', /ytimg\.com\/vi\/OYayy3Z4qls/);
  await expect(card.locator('iframe')).toHaveCount(0);
  await expect(page.locator('iframe[src*="youtube"]')).toHaveCount(0);
  await card.locator('.play').click();
  await expect(card.locator('iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/OYayy3Z4qls/);
});

test('the video story page plays in place of the photo and has no printed page', async ({ page }) => {
  await page.goto('/ar/issue/21/research-day/');
  await expect(page.locator('h1')).toContainText('يوم الأبحاث');
  await hydrated(page, '.story-video');
  await expect(page.locator('.story-video .play')).toContainText('3 دقائق');
  await expect(page.locator('.printed')).toHaveCount(0);
  await page.goto('/en/issue/21/research-day/');
  await expect(page.locator('.lang-note')).toContainText('Machine translation');
});

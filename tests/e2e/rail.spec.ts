import { test, expect } from '@playwright/test';
import { hydrated } from './helpers';

test('the edition rail says where you are and how many minutes are left, then rests', async ({ page }) => {
  await page.goto('/ar/');
  await hydrated(page, '.rail');
  const rail = page.locator('.rail');
  await expect(rail).toHaveAttribute('data-shown', 'false');
  await page.locator('#month').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 80);
  await expect(rail).toHaveAttribute('data-section', 'month');
  await expect(rail).toHaveAttribute('data-active', 'true');
  const atStart = Number(await rail.getAttribute('data-left'));
  expect(atStart).toBeGreaterThan(10);
  await expect(rail.locator('.rail-label')).toContainText('متبق');
  await page.locator('#hunt').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 120);
  await expect(rail).toHaveAttribute('data-section', 'hunt');
  const atHunt = Number(await rail.getAttribute('data-left'));
  expect(atHunt).toBeLessThan(atStart);
  await expect(rail.locator('.rail-notch.past')).toHaveCount(3);
  await page.waitForTimeout(1700);
  await expect(rail).toHaveAttribute('data-active', 'false');
  await page.locator('section.end').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 600);
  await expect(rail).toHaveAttribute('data-shown', 'false');
});

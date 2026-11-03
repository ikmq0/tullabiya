import { test, expect } from '@playwright/test';
import { hydrated } from './helpers';

const KEY = 'tullabiya:v1:state';

test('a first visit says nothing, and neither does a return after a break, though the visit is still recorded', async ({ page }) => {
  await page.goto('/ar/');
  await hydrated(page, '.hero');
  await expect(page.locator('[data-since]')).toHaveCount(0);
  await page.waitForFunction((key) => !!JSON.parse(localStorage.getItem(key) || '{}').lastVisit, KEY);
  // Pretend the previous visit was three hours ago, when only one clue was open.
  await page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key) || '{}');
    s.lastVisit = { at: Date.now() - 3 * 3_600_000, pollTotals: {}, clues: { 'hunt-21': 1 }, langs: ['ar'], delta: { first: true, sinceAt: null, votesSince: 0, newClues: 0 } };
    localStorage.setItem(key, JSON.stringify(s));
  }, KEY);
  await page.reload();
  await hydrated(page, '.hero');
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key) || '{}').lastVisit.at > Date.now() - 3_600_000, KEY);
  await expect(page.locator('[data-since]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('منذ زيارتك');
});

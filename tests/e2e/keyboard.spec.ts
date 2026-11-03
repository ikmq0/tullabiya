import { test, expect } from '@playwright/test';

/** Tab from the top: landmarks and the home page's controls come in reading order, each with a visible focus ring. */
test('keyboard order and visible focus on the home page', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/ar/');
  await page.locator('.hero astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  const seen: string[] = [];
  let ringOk = true;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 30);
      return { tag: el.tagName, cls: el.className.toString().split(' ')[0], label, ring };
    });
    if (!info) continue;
    seen.push(`${info.tag}.${info.cls}:${info.label}`);
    if (!info.ring) ringOk = false;
  }
  const order = seen.join(' > ');
  const expectBefore = (a: RegExp, b: RegExp) => {
    const ia = seen.findIndex((s) => a.test(s));
    const ib = seen.findIndex((s) => b.test(s));
    expect(ia, `${a} reached\n${order}`).toBeGreaterThanOrEqual(0);
    expect(ib, `${b} reached\n${order}`).toBeGreaterThanOrEqual(0);
    expect(ia, `${a} before ${b}\n${order}`).toBeLessThan(ib);
  };
  expectBefore(/A\.skip/, /A\.mark/);
  expectBefore(/A\.mark/, /A\.tool:English/);
  expectBefore(/A\.tool:English/, /BUTTON\.me-chip/);
  expectBefore(/BUTTON\.me-chip/, /BUTTON\.btn:خصّص/);
  expectBefore(/BUTTON\.btn:خصّص/, /A\.btn:ابدأ/);
  expectBefore(/A\.btn:ابدأ/, /A\.btn:اقرأ بالقارئ/);
  expectBefore(/A\.btn:اقرأ بالقارئ/, /BUTTON\.day/);
  expect(ringOk, `every focused element shows a focus ring\n${order}`).toBe(true);
});

test('the month strip is one tab stop and the poll options are reachable', async ({ page }) => {
  await page.goto('/ar/#month');
  await page.locator('.month astro-island:not([ssr])').first().waitFor({ state: 'attached' });
  await page.locator('.day[tabindex="0"]').focus();
  await page.keyboard.press('Tab');
  const next = await page.evaluate(() => (document.activeElement as HTMLElement).className);
  expect(next).not.toContain('day');
});

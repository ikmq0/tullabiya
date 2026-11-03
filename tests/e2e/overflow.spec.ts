import { expect, test } from '@playwright/test';

// Every page, both languages: nothing lays out past the content box. scrollWidth alone misses
// two cases this catches: RTL overflow on the left, and the mobile layout viewport growing to fit
// an over-wide element (which then shows as a zoomed-out page on a real phone).
const PATHS = ['/', '/calendar/', '/opportunities/', '/community/', '/my/', '/archive/', '/archive/21/'];

for (const lang of ['ar', 'en'] as const) {
  for (const path of PATHS) {
    test(`/${lang}${path} fits the viewport`, async ({ page }) => {
      await page.goto(`/${lang}${path}`);
      await page.waitForLoadState('networkidle');
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += 700) {
        await page.evaluate((v) => window.scrollTo(0, v), y);
        await page.waitForTimeout(40);
      }
      const r = await page.evaluate(() => {
        const de = document.documentElement;
        const cw = de.clientWidth;
        const iw = innerWidth;
        const off = getComputedStyle(de).direction === 'rtl' ? iw - cw : 0;
        const contained = (el: Element) => {
          for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
            if (getComputedStyle(e).overflowX !== 'visible') return true;
          }
          return false;
        };
        const hits: string[] = [];
        for (const el of document.querySelectorAll('body *')) {
          if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
          const cs = getComputedStyle(el);
          // Closed popovers are visibility:hidden and sit beside their trigger; they cannot be scrolled to
          // (body clips the x axis) and the viewport-width assertion below proves they do not widen the page.
          if (cs.position === 'fixed' || cs.display === 'none' || cs.display === 'contents' || cs.visibility === 'hidden') continue;
          const b = el.getBoundingClientRect();
          if (b.width === 0) continue;
          if ((b.right > off + cw + 1 || b.left < off - 1) && !contained(el)) {
            hits.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} [${Math.round(b.left - off)}..${Math.round(b.right - off)}]`);
          }
          if (hits.length >= 5) break;
        }
        return { iw, cw, hits };
      });
      expect(r.hits, 'elements outside the content box').toEqual([]);
      expect(r.iw, 'layout viewport grew past the device width').toBeLessThanOrEqual(r.cw + 17);
    });
  }
}

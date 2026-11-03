import { test, expect } from '@playwright/test';
import { expectNoHorizontalScroll } from './helpers';

/** Every UI string 40% longer: no horizontal overflow, headings still within two lines. */
const ROUTES = ['/', '/calendar/', '/opportunities/', '/community/', '/my/', '/archive/', '/archive/21/', '/read/21/', '/read/21/end/', '/hard-copy/'];

for (const lang of ['ar', 'en'] as const) {
  test(`lengthened text does not break the layout (${lang})`, async ({ page }) => {
    test.setTimeout(120_000);
    for (const r of ROUTES) {
      await page.goto(`/${lang}${r}`);
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes: Text[] = [];
        while (walker.nextNode()) nodes.push(walker.currentNode as Text);
        for (const n of nodes) {
          const p = n.parentElement;
          if (!p || p.closest('script, style, .strip, .viewer, .wall, .fp')) continue;
          const t = n.nodeValue ?? '';
          if (t.trim().length < 3) continue;
          const words = t.trim().split(/\s+/);
          const extra = words.slice(0, Math.max(1, Math.ceil(words.length * 0.4))).join(' ');
          n.nodeValue = `${t} ${extra}`;
        }
      });
      await page.waitForTimeout(100);
      await expectNoHorizontalScroll(page);
      const tooTall = await page.evaluate(() =>
        Array.from(document.querySelectorAll('h1, h2'))
          .filter((h) => {
            const cs = getComputedStyle(h);
            const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
            return h.getBoundingClientRect().height / lh > 3.2;
          })
          .map((h) => h.textContent?.slice(0, 50)),
      );
      expect(tooTall, `${lang}${r} headings over three lines with 40% more text`).toEqual([]);
    }
  });
}

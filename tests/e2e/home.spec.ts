import { test, expect } from '@playwright/test';
import { expectNoHorizontalScroll as noHorizontalScroll, headingLines } from './helpers';

for (const lang of ['ar', 'en'] as const) {
  test.describe(`home ${lang}`, () => {
    test('one h1 within two lines, headings on every section, no overflow', async ({ page }) => {
      await page.goto(`/${lang}/`);
      await expect(page.locator('h1')).toHaveCount(1);
      expect(await headingLines(page, 'h1')).toBeLessThanOrEqual(2.2);
      await noHorizontalScroll(page);
      const sections = page.locator('section');
      const n = await sections.count();
      expect(n).toBeGreaterThan(6);
      for (let i = 0; i < n; i++) {
        const s = sections.nth(i);
        const labelled = await s.getAttribute('aria-labelledby');
        const hasHeading = (await s.locator('h1, h2, h3').count()) > 0;
        const live = await s.getAttribute('aria-live');
        expect(labelled || hasHeading || live, `section ${i} has a heading`).toBeTruthy();
      }
    });

    test('every image has alt and the hero image has dimensions', async ({ page }) => {
      await page.goto(`/${lang}/`);
      const imgs = page.locator('img');
      const n = await imgs.count();
      expect(n).toBeGreaterThan(4);
      for (let i = 0; i < n; i++) {
        const alt = await imgs.nth(i).getAttribute('alt');
        expect(alt, `img ${i} alt`).toBeTruthy();
      }
      const hero = page.locator('.hero-photo img');
      await expect(hero).toHaveAttribute('width', /\d+/);
      await expect(hero).toHaveAttribute('height', /\d+/);
    });

    test('layout shift stays small after load', async ({ page }) => {
      await page.goto(`/${lang}/`);
      const cls = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            let total = 0;
            const po = new PerformanceObserver((list) => {
              for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
                if (!e.hadRecentInput) total += e.value;
              }
            });
            po.observe({ type: 'layout-shift', buffered: true });
            setTimeout(() => {
              po.disconnect();
              resolve(total);
            }, 1500);
          }),
      );
      expect(cls).toBeLessThan(0.05);
    });

    test('renders the hero, news and opportunities without JavaScript', async ({ browser, baseURL }) => {
      const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
      const page = await ctx.newPage();
      await page.goto(`/${lang}/`);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('.news h2')).toBeVisible();
      await expect(page.locator('.lead-story h3')).toBeVisible();
      await expect(page.locator('.opp h2')).toBeVisible();
      expect(await page.locator('.row').count()).toBeGreaterThan(0);
      await ctx.close();
    });

    test('every section keeps its place and its anchor on the home', async ({ page }) => {
      await page.goto(`/${lang}/`);
      const ids = await page.locator('main section[id]').evaluateAll((els) => els.map((e) => e.id));
      expect(ids).toEqual(['month', 'pulse', 'news', 'hunt', 'guest', 'voices', 'opp', 'arch']);
      await expect(page.locator('section.end')).toHaveCount(1);
      // The reader is a choice beside the home, not its replacement.
      await expect(page.locator('.hero-cta a').first()).toHaveAttribute('href', '#month');
      await expect(page.locator('.hero-cta a', { hasText: lang === 'ar' ? 'اقرأ بالقارئ الرقمي' : 'Open the digital reader' })).toHaveAttribute('href', `/${lang}/read/`);
    });

    test('each section lists less: lead plus title links, compact opportunities, a small archive row', async ({ page }) => {
      await page.goto(`/${lang}/`);
      for (const id of ['#news', '#voices']) {
        await expect(page.locator(`${id} article`)).toHaveCount(1);
        await expect(page.locator(`${id} .title-links p, ${id} .title-links img, ${id} .title-links button`)).toHaveCount(0);
        expect(await page.locator(`${id} .title-links a`).count()).toBeGreaterThan(0);
        await expect(page.locator(`${id} .chip-wrap, ${id} .react`)).toHaveCount(0);
      }
      await expect(page.locator('#opp .row')).toHaveCount(3);
      await expect(page.locator('#opp .row .acts')).toHaveCount(0);
      await expect(page.locator('main')).not.toContainText('[object');
      await expect(page.locator('#opp .opp-all a')).toHaveAttribute('href', `/${lang}/opportunities/`);
      await expect(page.locator('#arch .iss')).toHaveCount(4);
      await expect(page.locator('#arch .arch-all a')).toHaveAttribute('href', `/${lang}/archive/`);
    });

    test('says nothing first: no top band, no sheet, no favorites band; the disclosure sits by the footer', async ({ page }) => {
      await page.goto(`/${lang}/`);
      await page.locator('.hero astro-island:not([ssr])').first().waitFor({ state: 'attached' });
      await page.locator('astro-island:has(.sheet-root):not([ssr])').first().waitFor({ state: 'attached' });
      await page.waitForTimeout(400);
      await expect(page.locator('.notice, .toast, .favs, [data-since], .live')).toHaveCount(0);
      await expect(page.locator('.sheet-root')).toHaveAttribute('data-open', 'false');
      await expect(page.locator('[data-sample-note]')).toContainText(lang === 'ar' ? 'نموذج أولي' : 'Prototype');
      const note = await page.locator('[data-sample-note]').boundingBox();
      const foot = await page.locator('.foot').boundingBox();
      expect(note!.y + note!.height).toBeLessThanOrEqual(foot!.y + 1);
    });
  });
}

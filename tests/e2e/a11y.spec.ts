import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = ['/', '/calendar/', '/opportunities/', '/community/', '/my/', '/archive/', '/archive/21/', '/issue/21/musab-the-message-that-changed-the-path/', '/read/21/', '/read/3/', '/read/21/end/', '/hard-copy/'];

for (const lang of ['ar', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: no serious or critical violations, ${lang} ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ colorScheme: theme });
      for (const r of ROUTES) {
        await page.goto(`/${lang}${r}`);
        await page.waitForTimeout(300);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'])
          .disableRules(['region'])
          .analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(bad.map((v) => `${r}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html?.slice(0, 120)}`), `${lang} ${theme} ${r}`).toEqual([]);
      }
    });
  }
}

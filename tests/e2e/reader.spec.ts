import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type CDPSession, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectNoHorizontalScroll, hydrated } from './helpers';

const stage = '.rd-app .viewer-stage:not(.photo-stage)';
const openPage = (n: number) => `.viewer-stage:not(.photo-stage) .viewer-panel[data-at="cur"] img[data-page="${n}"]`;
const sheetSel = '.viewer-stage:not(.photo-stage) .viewer-panel[data-at="cur"] .viewer-sheet';
const zoomed = (page: Page) => page.locator(`${stage}[data-zoomed="true"]`);
const sheetScale = (page: Page) => page.locator(sheetSel).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
const trackX = (page: Page) => page.locator(`${stage} .viewer-track`).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
const LABEL = {
  ar: { zoomIn: 'كبّر الصفحة', zoomOut: 'صغّر الصفحة', next: 'الصفحة التالية', prev: 'الصفحة السابقة', close: 'إغلاق', del: 'احذف', save: 'احفظ' },
  en: { zoomIn: 'Zoom in on the page', zoomOut: 'Zoom out of the page', next: 'Next page', prev: 'Previous page', close: 'Close', del: 'Delete', save: 'Save' },
};
const tool = (page: Page, which: string) => page.locator(`[data-tool="${which}"]`);
const panelSel = '.rd-sheet, .rd-dock';

const STORY_DIR = fileURLToPath(new URL('../../src/data/stories/', import.meta.url));
const STORIES = readdirSync(STORY_DIR)
  .map((f) => JSON.parse(readFileSync(join(STORY_DIR, f), 'utf8')) as { id: string; pdfPage?: number; pdfRegion?: { x: number; y: number; w: number; h: number } })
  .filter((s) => s.pdfRegion);

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator(`${stage} img`).first().waitFor();
  await page.locator('.rd-count').first().waitFor();
}
/** Opens a panel. On a laptop Contents is already docked open. */
async function openPanel(page: Page, which: string) {
  const t = tool(page, which);
  if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click();
  await page.locator(panelSel).first().waitFor();
}
async function closePanel(page: Page, isMobile: boolean) {
  if (isMobile) await page.keyboard.press('Escape');
}
const settled = (page: Page) => page.waitForFunction((sel) => {
  const s = document.querySelector(sel);
  return s && s.getAnimations().length === 0;
}, sheetSel);

/* ---------- Touch, through the browser's real input pipeline ---------- */

type Touch = { x: number; y: number; id?: number };
const cdp = (page: Page) => page.context().newCDPSession(page);
const send = (c: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', touchPoints: Touch[]) => c.send('Input.dispatchTouchEvent', { type, touchPoints });

async function drag(page: Page, c: CDPSession, from: Touch, to: Touch, opts: { steps?: number; lift?: boolean } = {}) {
  const steps = opts.steps ?? 10;
  await send(c, 'touchStart', [from]);
  for (let i = 1; i <= steps; i++) {
    await send(c, 'touchMove', [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]);
    await page.waitForTimeout(16);
  }
  if (opts.lift !== false) await send(c, 'touchEnd', []);
}
async function tap(c: CDPSession, at: Touch) {
  await send(c, 'touchStart', [at]);
  await send(c, 'touchEnd', []);
}
const pageBox = async (page: Page, n: number) => (await page.locator(openPage(n)).boundingBox())!;
/** A spot on the page clear of any photo: the footer strip. */
const quietSpot = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height * 0.975 });

async function ready(page: Page, path: string, n: number) {
  await open(page, path);
  const box = await pageBox(page, n);
  return { c: await cdp(page), box, mid: { x: box.x + box.width / 2, y: box.y + box.height / 2 } };
}

/* ---------- The shell ---------- */

test('opens straight on the cover, full screen, with its own chrome and none of the site', async ({ page }) => {
  await open(page, '/ar/read/21/');
  await expect(page.locator(openPage(1))).toBeVisible();
  await expect(page.locator('header.bar')).toHaveCount(0);
  await expect(page.locator('footer.foot')).toHaveCount(0);
  await expect(page.locator('.rd-app h1')).toHaveText('العدد 21');
  await expect(page.locator('.rd-count').first()).toHaveText('صفحة 1 من 8');
  await expect(page.locator('.rd-app a[href="/ar/"]').first()).toBeAttached();
  for (const which of ['contents', 'pages', 'mark', 'notes', 'more']) await expect(tool(page, which)).toBeVisible();
  const box = (await page.locator('.rd-app').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.width).toBe(vp.width);
  expect(box.height).toBe(vp.height);
});

test('/read/ opens the current issue', async ({ page }) => {
  await page.goto('/ar/read/');
  await expect(page).toHaveURL(/\/ar\/read\/21\/$/);
  await page.locator(`${stage} img`).first().waitFor();
});

test('English opens too', async ({ page }) => {
  await open(page, '/en/read/21/');
  await expect(page.locator('.rd-app h1')).toHaveText('Issue 21');
  await expect(page.locator('.rd-count').first()).toHaveText('Page 1 of 8');
});

test('the page shows as a vector, and the JPEG stands in when the vector is missing', async ({ page }) => {
  await open(page, '/ar/read/21/?p=3');
  await expect(page.locator(openPage(3))).toHaveAttribute('src', /v03\.svg$/);
  await page.route(/\/v\d\d\.svg/, (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto('/ar/read/21/?p=4');
  await expect(page.locator(openPage(4))).toHaveAttribute('src', /p04\.jpg$/);
  await expect(page.locator(openPage(4))).toBeVisible();
});

/* ---------- The settled view ---------- */

test('the settled page is painted at device pixels: not blank, aligned, and clear of the marks', async ({ page }) => {
  await open(page, '/ar/read/21/?p=3');
  await page.getByRole('button', { name: LABEL.ar.zoomIn }).click();
  await expect.poll(() => sheetScale(page)).toBeCloseTo(2);
  const canvas = page.locator('.page-canvas');
  await expect(canvas).toBeAttached();
  await page.waitForTimeout(500);
  const r = await page.evaluate((sel) => {
    const c = document.querySelector<HTMLCanvasElement>('.page-canvas')!;
    const st = document.querySelector(sel)!.getBoundingClientRect();
    const b = c.getBoundingClientRect();
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    let light = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      if (d[i] < 120) dark++;
      if (d[i] > 240) light++;
    }
    return { dark, light, cw: c.width, ch: c.height, dpr: devicePixelRatio, st: [st.x, st.y, st.width, st.height], box: [b.x, b.y, b.width, b.height], z: getComputedStyle(c).zIndex };
  }, stage);
  expect(r.dark, 'text and pictures on the canvas').toBeGreaterThan(50);
  expect(r.light, 'paper on the canvas').toBeGreaterThan(50);
  expect(r.cw).toBe(Math.round(r.st[2] * r.dpr));
  for (let i = 0; i < 4; i++) expect(Math.abs(r.box[i] - r.st[i]), 'the canvas covers exactly the stage').toBeLessThan(1);
});

test('a new input cancels the wait, and a pan does not leave the page behind', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the mouse version');
  await open(page, '/ar/read/21/?p=3');
  await page.getByRole('button', { name: LABEL.ar.zoomIn }).click();
  await settled(page);
  const box = (await page.locator(stage).boundingBox())!;
  const at = { x: box.x + box.width / 2, y: box.y + box.height * 0.5 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x - 60, at.y - 40, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const offset = await page.evaluate((sel) => {
    const c = document.querySelector('.page-canvas')!.getBoundingClientRect();
    const st = document.querySelector(sel)!.getBoundingClientRect();
    return Math.abs(c.x - st.x) + Math.abs(c.y - st.y);
  }, stage);
  expect(offset).toBeLessThan(1);
});

/* ---------- Turning pages ---------- */

test('arrow keys follow reading direction in Arabic', async ({ page }) => {
  await open(page, '/ar/read/21/');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator(openPage(2))).toBeVisible();
  await page.waitForTimeout(350);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator(openPage(1))).toBeVisible();
});

test('arrow keys follow reading direction in English', async ({ page }) => {
  await open(page, '/en/read/21/');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator(openPage(2))).toBeVisible();
});

test('the buttons turn pages, keep the place in the address, and leave one spread at rest', async ({ page, isMobile }) => {
  await open(page, '/ar/read/21/?p=2');
  await page.getByRole('button', { name: LABEL.ar.next }).click();
  await expect(page).toHaveURL(/\?p=[34]$/);
  await expect(page.locator('.viewer-panel[data-at="next"], .viewer-panel[data-at="prev"]')).toHaveCount(0);
  await expect(page.locator(`${sheetSel} img`)).toHaveCount(isMobile ? 1 : 2);
});

for (const lang of ['ar', 'en'] as const) {
  test(`on a wide screen the first page of a spread sits on the right (${lang})`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'facing pages are for wide screens');
    await open(page, `/${lang}/read/21/?p=3`);
    expect((await pageBox(page, 2)).x).toBeGreaterThan((await pageBox(page, 3)).x);
  });
}

test('a page link opens that page, from the query or the hash, and only nearby pages load', async ({ page, isMobile }) => {
  const asked = new Set<string>();
  page.on('request', (r) => {
    const m = /\/archive\/21\/([pv]\d\d)\./.exec(r.url());
    if (m) asked.add(m[1]);
  });
  await open(page, '/ar/read/21/?p=3');
  await expect(page.locator(openPage(3))).toBeVisible();
  await page.waitForLoadState('networkidle');
  for (const far of ['v06', 'v07', 'v08', 'p06', 'p07', 'p08']) expect(asked.has(far), `${far} of ${[...asked]}`).toBe(false);
  if (isMobile) expect(asked.has('v05')).toBe(false);
  await open(page, '/ar/read/21/#p5');
  await expect(page.locator(openPage(5))).toBeVisible();
});

test.describe('touch', () => {
  test.beforeEach(({ isMobile }) => test.skip(!isMobile, 'touch input is on the mobile project'));

  test('the page follows the finger 1:1 with its neighbor beside it, and a short slow drag settles back', async ({ page }) => {
    const { c, mid } = await ready(page, '/ar/read/21/?p=3', 3);
    await drag(page, c, { x: mid.x - 60, y: mid.y }, { x: mid.x + 20, y: mid.y }, { steps: 8, lift: false });
    expect(Math.abs((await trackX(page)) - 80)).toBeLessThan(2);
    const next = (await page.locator('.viewer-panel[data-at="next"] img').boundingBox())!;
    expect(next.x + next.width, 'in Arabic the next page waits on the left').toBeLessThanOrEqual((await pageBox(page, 3)).x + 1);
    await page.waitForTimeout(150);
    await send(c, 'touchEnd', []);
    await expect.poll(() => trackX(page)).toBeCloseTo(0);
    await expect(page.locator(openPage(3))).toBeVisible();
  });

  test('in Arabic a long drag to the right turns forward, to the left back', async ({ page }) => {
    const { c, box, mid } = await ready(page, '/ar/read/21/?p=3', 3);
    await drag(page, c, { x: box.x + 40, y: mid.y }, { x: box.x + box.width - 40, y: mid.y });
    await expect(page.locator(openPage(4))).toBeVisible();
    await expect(page).toHaveURL(/\?p=4$/);
    await expect(page.locator('.rd-count').first()).toHaveText('صفحة 4 من 8');
    await page.waitForTimeout(400);
    await drag(page, c, { x: box.x + box.width - 40, y: mid.y }, { x: box.x + 40, y: mid.y });
    await expect(page.locator(openPage(3))).toBeVisible();
  });

  test('in English a long drag to the left turns forward', async ({ page }) => {
    const { c, box, mid } = await ready(page, '/en/read/21/?p=3', 3);
    await drag(page, c, { x: box.x + box.width - 40, y: mid.y }, { x: box.x + 40, y: mid.y });
    await expect(page.locator(openPage(4))).toBeVisible();
  });

  test('a short quick flick turns too', async ({ page }) => {
    const { c, mid } = await ready(page, '/ar/read/21/?p=3', 3);
    await drag(page, c, { x: mid.x - 30, y: mid.y }, { x: mid.x + 30, y: mid.y }, { steps: 3 });
    await expect(page.locator(openPage(4))).toBeVisible();
  });

  test('the first and last pages rubber-band and stay', async ({ page }) => {
    const { c, box, mid } = await ready(page, '/ar/read/21/', 1);
    await drag(page, c, { x: box.x + box.width - 40, y: mid.y }, { x: box.x + 40, y: mid.y }, { lift: false });
    const during = Math.abs(await trackX(page));
    expect(during).toBeGreaterThan(0);
    expect(during).toBeLessThan((box.width - 80) / 2);
    await page.waitForTimeout(150);
    await send(c, 'touchEnd', []);
    await expect.poll(() => trackX(page)).toBeCloseTo(0);
    await expect(page.locator(openPage(1))).toBeVisible();
    await open(page, '/ar/read/21/?p=8');
    await drag(page, c, { x: box.x + 40, y: mid.y }, { x: box.x + box.width - 40, y: mid.y });
    await page.waitForTimeout(350);
    await expect(page.locator(openPage(8))).toBeVisible();
  });

  test('catching a settling page carries on from where it is', async ({ page }) => {
    const { c, box, mid } = await ready(page, '/ar/read/21/?p=3', 3);
    await drag(page, c, { x: box.x + 40, y: mid.y }, { x: box.x + box.width - 40, y: mid.y }, { steps: 6 });
    await send(c, 'touchStart', [{ x: mid.x, y: mid.y }]);
    expect(Math.abs(await trackX(page))).toBeGreaterThan(0);
    await page.waitForTimeout(150);
    await send(c, 'touchMove', [{ x: mid.x, y: mid.y }]);
    await send(c, 'touchEnd', []);
    await expect.poll(() => trackX(page)).toBeCloseTo(0);
    await expect(page.locator('.viewer-panel[data-at="next"], .viewer-panel[data-at="prev"]')).toHaveCount(0);
  });

  test('pinch zooms about the fingers, stays put when it lifts, and the view pans', async ({ page }) => {
    const { c, mid } = await ready(page, '/ar/read/21/?p=2', 2);
    const pointUnder = async () => {
      const b = await pageBox(page, 2);
      return { u: (mid.x - b.x) / b.width, v: (mid.y - b.y) / b.height, b };
    };
    const before = await pointUnder();
    await send(c, 'touchStart', [{ x: mid.x - 40, y: mid.y, id: 0 }, { x: mid.x + 40, y: mid.y, id: 1 }]);
    for (let d = 45; d <= 120; d += 15) {
      await send(c, 'touchMove', [{ x: mid.x - d, y: mid.y, id: 0 }, { x: mid.x + d, y: mid.y, id: 1 }]);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(50);
    const during = (await page.locator(openPage(2)).boundingBox())!;
    await send(c, 'touchEnd', []);
    await page.waitForTimeout(500);
    await expect(zoomed(page)).toHaveCount(1);
    const after = await pointUnder();
    expect(Math.abs(after.u - before.u) * after.b.width, 'the point under the fingers stays').toBeLessThan(3);
    expect(Math.abs(after.v - before.v) * after.b.height).toBeLessThan(3);
    expect(Math.abs(after.b.x - during.x), 'nothing jumps when the view settles').toBeLessThan(2);
    expect(Math.abs(after.b.y - during.y)).toBeLessThan(2);
    const z = await sheetScale(page);
    expect(z).toBeGreaterThan(2.5);
    expect(z).toBeLessThanOrEqual(4);
    await drag(page, c, { x: mid.x - 40, y: mid.y }, { x: mid.x + 40, y: mid.y });
    await page.waitForTimeout(300);
    expect((await page.locator(openPage(2)).boundingBox())!.x, 'pans with the finger').toBeGreaterThan(after.b.x);
  });

  test('at the edge of a zoomed page, a further drag turns it; zoom resets', async ({ page }) => {
    const { c, box, mid } = await ready(page, '/ar/read/21/?p=3', 3);
    await page.getByRole('button', { name: LABEL.ar.zoomIn }).click();
    await settled(page);
    // Far to the right brings the page's left edge in; in Arabic a drag to the right moves forward.
    await drag(page, c, { x: box.x + 30, y: mid.y }, { x: box.x + box.width - 30, y: mid.y });
    await page.waitForTimeout(350);
    await expect(page.locator(openPage(3))).toBeVisible();
    await drag(page, c, { x: box.x + 30, y: mid.y }, { x: box.x + box.width - 30, y: mid.y });
    await expect(page.locator(openPage(4))).toBeVisible();
    await expect(zoomed(page)).toHaveCount(0);
  });

  test('a double tap toggles zoom; a single tap hides and shows both bars', async ({ page }) => {
    const { c, box } = await ready(page, '/ar/read/21/?p=2', 2);
    const spot = quietSpot(box);
    await tap(c, spot);
    await page.waitForTimeout(60);
    await tap(c, spot);
    await expect(zoomed(page)).toHaveCount(1);
    await page.waitForTimeout(450);
    await tap(c, spot);
    await page.waitForTimeout(60);
    await tap(c, spot);
    await expect(zoomed(page)).toHaveCount(0);
    await page.waitForTimeout(450);
    await expect(page.locator('.rd-bottom')).toBeVisible();
    await tap(c, spot);
    await expect(page.locator('.rd-bottom')).toBeHidden();
    await expect(page.locator('.rd-top')).toBeHidden();
    await page.waitForTimeout(400);
    await tap(c, spot);
    await expect(page.locator('.rd-bottom')).toBeVisible();
  });

  test('a tap on a photo opens it; a drag across one still turns the page', async ({ page }) => {
    const { c, box } = await ready(page, '/ar/read/21/?p=3', 3);
    const photo = (await page.locator('.page-photo').first().boundingBox())!;
    const y = photo.y + photo.height / 2;
    await tap(c, { x: photo.x + photo.width / 2, y });
    await expect(page.locator('.photo-viewer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.photo-viewer')).toHaveCount(0);
    await drag(page, c, { x: box.x + 40, y }, { x: box.x + box.width - 40, y });
    await expect(page.locator(openPage(4))).toBeVisible();
    await expect(page.locator('.photo-viewer')).toHaveCount(0);
  });

  test('swiping moves between the photos of a page; a swipe down closes', async ({ page }) => {
    const { c } = await ready(page, '/ar/read/21/?p=3', 3);
    const photo = (await page.locator('.page-photo').first().boundingBox())!;
    await tap(c, { x: photo.x + photo.width / 2, y: photo.y + photo.height / 2 });
    await expect(page.locator('.photo-count')).toContainText('1 من');
    await page.waitForTimeout(500);
    const box = (await page.locator('.photo-stage').boundingBox())!;
    const y = box.y + box.height / 2;
    await drag(page, c, { x: box.x + 40, y }, { x: box.x + box.width - 40, y });
    await expect(page.locator('.photo-count')).toContainText('2 من');
    await page.waitForTimeout(350);
    await drag(page, c, { x: box.x + box.width / 2, y: y - 100 }, { x: box.x + box.width / 2, y: y + 200 });
    await expect(page.locator('.photo-viewer')).toHaveCount(0);
  });

  test('a vertical drag on the archive page viewer still scrolls that page', async ({ page }) => {
    await page.goto('/ar/archive/21/');
    await page.locator('.viewer-stage img').waitFor();
    await page.locator('.viewer-stage').scrollIntoViewIfNeeded();
    const box = (await page.locator('.viewer-stage').boundingBox())!;
    const c = await cdp(page);
    const y0 = await page.evaluate(() => scrollY);
    const x = box.x + box.width / 2;
    const top = Math.max(box.y + 40, 100);
    await drag(page, c, { x, y: top + 400 }, { x, y: top + 40 }, { steps: 12 });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y0 + 100);
    await expect(page.locator('.viewer-stage img')).toHaveAttribute('data-page', '1');
  });

  test('in highlight mode a finger marks, snapping to the words, instead of moving the page', async ({ page }) => {
    const { c, box } = await ready(page, '/ar/read/21/?p=3', 3);
    await tool(page, 'mark').click();
    await drag(page, c, { x: box.x + box.width * 0.9, y: box.y + box.height * 0.25 }, { x: box.x + box.width * 0.72, y: box.y + box.height * 0.33 });
    await expect(page.locator('.page-mark').first()).toBeAttached();
    expect(await page.locator('.page-mark').count(), 'one rectangle per line').toBeGreaterThan(1);
    await expect(page.locator(openPage(3))).toBeVisible();
  });
});

/* ---------- Zoom ---------- */

for (const lang of ['ar', 'en'] as const) {
  test(`zoom has buttons and keys, and turning a page resets it (${lang})`, async ({ page }) => {
    const L = LABEL[lang];
    await open(page, `/${lang}/read/21/?p=2`);
    await expect(page.getByRole('button', { name: L.zoomOut })).toBeDisabled();
    await page.getByRole('button', { name: L.zoomIn }).click();
    await expect.poll(() => sheetScale(page)).toBeCloseTo(2);
    await page.keyboard.press('+');
    await expect.poll(() => sheetScale(page)).toBeCloseTo(3);
    await page.keyboard.press('-');
    await expect.poll(() => sheetScale(page)).toBeCloseTo(2);
    await page.keyboard.press('Escape');
    await expect(zoomed(page)).toHaveCount(0);
    await page.getByRole('button', { name: L.zoomIn }).click();
    await expect(zoomed(page)).toHaveCount(1);
    await page.getByRole('button', { name: L.next }).click();
    await expect(page).not.toHaveURL(/\?p=2$/);
    await expect(zoomed(page)).toHaveCount(0);
  });
}

test.describe('mouse and trackpad', () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, 'laptop input'));

  test('Ctrl+wheel zooms about the cursor, and a plain wheel at 1x turns nothing', async ({ page }) => {
    await open(page, '/ar/read/21/?p=3');
    await page.locator('.page-canvas').waitFor({ state: 'attached' });
    const st = (await page.locator(stage).boundingBox())!;
    const at = { x: st.x + st.width * 0.3, y: st.y + st.height * 0.4 };
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(250);
    await expect(page.locator(openPage(3))).toBeVisible();
    await expect(zoomed(page)).toHaveCount(0);
    const before = await pageBox(page, 3);
    const u = (at.x - before.x) / before.width;
    const v = (at.y - before.y) / before.height;
    await page.keyboard.down('Control');
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -20);
      await page.waitForTimeout(30);
    }
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);
    const z = await sheetScale(page);
    expect(z).toBeGreaterThan(1.5);
    const after = await pageBox(page, 3);
    expect(Math.abs(u * after.width + after.x - at.x), 'the point under the cursor stays').toBeLessThan(2);
    expect(Math.abs(v * after.height + after.y - at.y)).toBeLessThan(2);
  });

  test('while zoomed a plain wheel pans, within the edges', async ({ page }) => {
    await open(page, '/ar/read/21/?p=3');
    await page.getByRole('button', { name: LABEL.ar.zoomIn }).click();
    await settled(page);
    const before = await pageBox(page, 3);
    const st = (await page.locator(stage).boundingBox())!;
    await page.mouse.move(st.x + st.width / 2, st.y + st.height / 2);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(250);
    expect((await pageBox(page, 3)).y).toBeLessThan(before.y);
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    const sheet = (await page.locator(sheetSel).boundingBox())!;
    expect(sheet.y + sheet.height, 'stops at the bottom of the page').toBeGreaterThanOrEqual(st.y + st.height - 1);
  });

  test('a double click zooms about the cursor and back; the drag pans, and a pan from a photo never opens it', async ({ page }) => {
    await open(page, '/ar/read/21/?p=8');
    const box = await pageBox(page, 8);
    const at = quietSpot(box);
    await page.mouse.dblclick(at.x, at.y);
    await expect(zoomed(page)).toHaveCount(1);
    await expect.poll(() => sheetScale(page)).toBeCloseTo(2.5);
    await page.mouse.dblclick(at.x, at.y);
    await expect(zoomed(page)).toHaveCount(0);
    await open(page, '/ar/read/21/?p=3');
    await page.getByRole('button', { name: LABEL.ar.zoomIn }).click();
    await settled(page);
    const photo = (await page.locator('.page-photo').first().boundingBox())!;
    const st = (await page.locator(stage).boundingBox())!;
    const from = { x: Math.max(st.x + 20, photo.x + 20), y: Math.max(st.y + 20, photo.y + 20) };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + 30, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(page.locator('.photo-viewer')).toHaveCount(0);
  });

  test('a mouse click on a photo opens it at once; a click on the page keeps the rail', async ({ page }) => {
    await open(page, '/ar/read/21/?p=3');
    await page.locator('.page-photo').first().waitFor({ state: 'attached' });
    const b = await pageBox(page, 3);
    await page.mouse.click(quietSpot(b).x, quietSpot(b).y);
    await page.waitForTimeout(350);
    await expect(page.locator('.rd-rail')).toBeVisible();
    const photo = (await page.locator('.page-photo').first().boundingBox())!;
    await page.mouse.click(photo.x + photo.width / 2, photo.y + photo.height / 2);
    await expect(page.locator('.photo-viewer')).toBeVisible({ timeout: 300 });
  });
});

/* ---------- The laptop layout ---------- */

test.describe('laptop', () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, 'wide layout'));

  test('the tools are a rail on the side the language starts from, with Contents docked beside it', async ({ page }) => {
    await open(page, '/ar/read/21/');
    const vp = page.viewportSize()!;
    const rail = (await page.locator('.rd-rail').boundingBox())!;
    const dock = (await page.locator('.rd-dock').boundingBox())!;
    const st = (await page.locator(stage).boundingBox())!;
    expect(rail.x + rail.width).toBeCloseTo(vp.width, 0);
    expect(dock.x + dock.width).toBeCloseTo(rail.x, 0);
    expect(st.x + st.width).toBeCloseTo(dock.x, 0);
    await expect(page.locator('.rd-bottom')).toHaveCount(0);
    await open(page, '/en/read/21/');
    expect((await page.locator('.rd-rail').boundingBox())!.x).toBe(0);
    expect((await page.locator(stage).boundingBox())!.x).toBeGreaterThan(300);
  });

  test('Contents stays open when a story is chosen, keeps the place marked, and collapsing is remembered', async ({ page }) => {
    await open(page, '/ar/read/21/');
    await page.locator('.rd-dock a', { hasText: 'مصعب' }).click();
    await expect(page.locator(openPage(5))).toBeVisible();
    await expect(page.locator('.rd-dock')).toBeVisible();
    await expect(page.locator('.rd-dock .rd-sec a[aria-current="true"]')).toContainText('مصعب');
    await tool(page, 'contents').click();
    await expect(page.locator('.rd-dock')).toHaveCount(0);
    await page.reload();
    await page.locator('.rd-count').first().waitFor();
    await expect(page.locator('.rd-dock')).toHaveCount(0);
    await expect(page.locator('.rd-rail')).toBeVisible();
  });
});

/* ---------- Contents: the story's place in the file ---------- */

for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
  test.describe(`every story at ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });
    test('lands on screen, at the right start edge, without going past a comfortable zoom', async ({ page, isMobile }) => {
      test.skip(isMobile !== (size.width === 390), 'each size on its own project');
      test.setTimeout(120_000);
      for (const s of STORIES) {
        await page.goto(`/ar/read/21/?p=${s.pdfPage}&s=${s.id}`);
        await page.locator(openPage(s.pdfPage!)).waitFor();
        await settled(page);
        await page.waitForTimeout(650);
        const r = await page.evaluate(([n, reg, sel]) => {
          const st = document.querySelector(sel as string)!.getBoundingClientRect();
          const box = document.querySelector(`.viewer-panel[data-at="cur"] [data-page-box="${n}"]`)!.getBoundingClientRect();
          const g = reg as { x: number; y: number; w: number; h: number };
          const right = box.left + (g.x + g.w) * box.width;
          const top = box.top + g.y * box.height;
          return { st: [st.left, st.top, st.right, st.bottom], box: [box.left, box.top, box.right, box.bottom], right, top, pageW: box.width, count: document.querySelector('.rd-count')!.textContent };
        }, [s.pdfPage, s.pdfRegion, stage]);
        const [sl, st, sr, sb] = r.st;
        expect(r.box[2] > sl && r.box[0] < sr && r.box[3] > st && r.box[1] < sb, `${s.id}: page intersects the stage`).toBe(true);
        expect(r.right, `${s.id}: start edge on screen`).toBeLessThanOrEqual(sr + 1);
        expect(r.right, `${s.id}: start edge on screen`).toBeGreaterThan(sl);
        expect(r.top, `${s.id}: top on screen`).toBeGreaterThanOrEqual(st - 1);
        expect(r.top, `${s.id}: top on screen`).toBeLessThan(sb);
        const z = await sheetScale(page);
        expect(z, `${s.id}: scale`).toBeLessThanOrEqual(size.width === 390 ? 3.01 : 2.01);
        expect(r.count).toContain(String(s.pdfPage));
      }
    });
  });
}

test.describe('going to a story', () => {
  test('from Contents: the page, zoomed in, the region on screen, and one tap back to the whole page', async ({ page, isMobile }) => {
    await open(page, '/ar/read/21/');
    await openPanel(page, 'contents');
    const before = await page.evaluate(() => history.length);
    await page.locator(`${panelSel} .rd-sec a`, { hasText: 'مصعب' }).click();
    await expect(page.locator(openPage(5))).toBeVisible();
    await expect(page).toHaveURL(/\?p=5&s=21-musab$/);
    await expect.poll(() => sheetScale(page)).toBeGreaterThan(1);
    if (isMobile) {
      await expect(page.locator('.rd-sheet')).toHaveCount(0);
      await expect(page.locator('.rd-section')).toContainText('تجربتي');
    }
    expect(await page.evaluate(() => history.length), 'no stack of history entries').toBe(before);
    await settled(page);
    await page.locator('.rd-whole').click();
    await expect(zoomed(page)).toHaveCount(0);
    await expect(page.locator('.rd-whole')).toHaveCount(0);
  });

  test('a section goes to its first story', async ({ page }) => {
    await open(page, '/ar/read/21/?p=8');
    await openPanel(page, 'contents');
    await page.locator(`${panelSel} .rd-sec h3 a`, { hasText: 'مشاركاتي' }).click();
    await expect(page).toHaveURL(/\?p=6&s=21-letter$/);
    await expect(page.locator(openPage(6))).toBeVisible();
  });

  test('a deep link lands on the story, and the web page of a story links there', async ({ page }) => {
    await open(page, '/ar/read/21/?p=3&s=21-formula');
    await expect.poll(() => sheetScale(page)).toBeGreaterThan(1);
    await page.goto('/ar/issue/21/murshid-fifth-edition/');
    await expect(page.locator('.story-see a')).toHaveAttribute('href', '/ar/read/21/?p=3&s=21-murshid#p3');
  });

  test('the position remembers the story', async ({ page }) => {
    await open(page, '/ar/read/21/?p=3&s=21-formula');
    await page.goto('about:blank');
    await open(page, '/ar/read/21/');
    await expect(page.locator(openPage(1))).toBeVisible();
    await expect(page.locator('.rd-continue a')).toHaveAttribute('href', /p=3&s=21-formula/);
    await page.locator('.rd-continue a').click();
    await expect(page.locator(openPage(3))).toBeVisible();
    await expect.poll(() => sheetScale(page)).toBeGreaterThan(1);
  });

  test('nothing else breaks while zoomed from a jump', async ({ page }) => {
    await open(page, '/ar/read/21/?p=3&s=21-council');
    await settled(page);
    await page.waitForTimeout(400);
    // The input takes over at once, with no snap back.
    await page.keyboard.press('+');
    await expect.poll(() => sheetScale(page)).toBeGreaterThan(2);
    await settled(page);
    const z = await sheetScale(page);
    await page.waitForTimeout(400);
    expect(await sheetScale(page)).toBeCloseTo(z);
    // A mark still lands and stays aligned.
    await tool(page, 'mark').click();
    const box = await pageBox(page, 3);
    const st = (await page.locator(stage).boundingBox())!;
    const at = { x: Math.min(st.x + st.width - 30, box.x + box.width * 0.5), y: st.y + st.height * 0.5 };
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x - 80, at.y + 60, { steps: 5 });
    await page.mouse.up();
    await tool(page, 'mark').click();
    await expect(page.locator('.page-mark').first()).toBeAttached();
    // The next-page button still works and returns to the whole page.
    await page.getByRole('button', { name: LABEL.ar.next }).click();
    await expect(page).not.toHaveURL(/p=3/);
    await expect(zoomed(page)).toHaveCount(0);
  });

  test('only the web-only story leaves the reader', async ({ page }) => {
    await open(page, '/ar/read/21/');
    await openPanel(page, 'contents');
    const leaving = await page.locator(`${panelSel} a[href*="/issue/"]`).evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(leaving).toEqual(['/ar/issue/21/research-day/']);
  });
});

/* ---------- Contents and pages ---------- */

test('the contents follow the magazine and mark the current section', async ({ page }) => {
  await open(page, '/ar/read/21/?p=4');
  await openPanel(page, 'contents');
  const panel = page.locator(panelSel).first();
  await expect(panel.locator('.rd-sec')).toHaveCount(5);
  await expect(panel.locator('.rd-sec[data-here="true"]')).toContainText('ضيف الثلاثين');
  await expect(panel.locator('.rd-sec a[aria-current="true"]')).toContainText('بدر');
  await expect(panel.locator('.rd-sec', { hasText: 'الأخبار' }).locator('.rd-row')).toHaveCount(5);
  await expect(panel.getByText('على الموقع فقط')).toHaveCount(1);
  await expect(panel.locator('.rd-here')).toContainText('بدر');
});

test('thumbnails sit under their sections and jump; so does the page number', async ({ page, isMobile }) => {
  await open(page, '/ar/read/21/?p=2');
  await openPanel(page, 'pages');
  await expect(page.locator('.rd-thumb')).toHaveCount(8);
  await expect(page.locator('.rd-thumb-group h3')).toHaveText(['الأخبار', 'ضيف الثلاثين', 'تجربتي', 'مشاركاتي', 'الأخيرة']);
  await page.locator('.rd-thumb').nth(5).click();
  await expect(page.locator(openPage(6))).toBeVisible();
  if (isMobile) await openPanel(page, 'pages');
  await page.locator('#rd-jump').fill('8');
  await page.keyboard.press('Enter');
  await expect(page.locator(openPage(8))).toBeVisible();
});

test('a back issue has a plain thumbnails outline', async ({ page }) => {
  await open(page, '/ar/read/3/');
  await openPanel(page, 'contents');
  await expect(page.locator('.rd-thumb')).toHaveCount(8);
  await expect(page.locator('.rd-thumb-group h3, .rd-sec')).toHaveCount(0);
});

test('a sheet closes with Escape on a phone and leaves the page where it was', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a sheet on phones');
  await open(page, '/ar/read/21/?p=4');
  await openPanel(page, 'contents');
  await page.keyboard.press('Escape');
  await expect(page.locator('.rd-sheet')).toHaveCount(0);
  await expect(page.locator(openPage(4))).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page).not.toHaveURL(/\?p=4$/);
});

test('More holds the PDF, the hard copy, the end and the neighboring issues', async ({ page }) => {
  await open(page, '/ar/read/21/');
  await openPanel(page, 'more');
  const more = page.locator('.rd-more');
  await expect(more.locator('a[download]')).toHaveAttribute('href', '/archive/21/issue.pdf');
  await expect(more.locator('a[href="/ar/hard-copy/"]')).toHaveCount(1);
  await expect(more.locator('a[href="/ar/read/21/end/"]')).toHaveCount(1);
  await expect(more.locator('a[rel="prev"]')).toHaveAttribute('href', '/ar/read/20/');
  await expect(more.locator('a[rel="next"]')).toHaveAttribute('href', '/ar/read/22/');
});

/* ---------- Ends and links ---------- */

test('the last page and the last story both lead to the end screen', async ({ page }) => {
  await open(page, '/ar/read/21/?p=8');
  await page.locator('[data-to-end]').click();
  await expect(page).toHaveURL(/\/ar\/read\/21\/end\/$/);
  await expect(page.locator('h1')).toContainText('هنا ينتهي العدد 21');
  await page.goto('/ar/issue/21/discover-consulting-with-bcg/');
  await expect(page.locator('.story-seq-next')).toHaveAttribute('href', '/ar/read/21/end/');
});

test('stories follow the issue order; a web-only one offers no printed page', async ({ page }) => {
  await page.goto('/en/issue/21/murshid-fifth-edition/');
  await expect(page.locator('.story-seq-prev')).toHaveAttribute('href', '/en/issue/21/orientation-2026/');
  await expect(page.locator('.story-seq-next')).toHaveAttribute('href', '/en/issue/21/advisory-council-2025-2026/');
  await page.goto('/en/issue/21/orientation-2026/');
  await expect(page.locator('.story-seq-prev')).toHaveCount(0);
  await page.goto('/ar/issue/21/research-day/');
  await expect(page.locator('.story-see')).toHaveCount(0);
});

test('the end screen walks the archive by number, past the current issue', async ({ page }) => {
  await page.goto('/ar/read/21/end/');
  await expect(page.locator('.issue-nav-next')).toHaveAttribute('href', '/ar/read/22/');
  await page.goto('/ar/read/1/end/');
  await expect(page.locator('.issue-nav-prev')).toHaveCount(0);
  await page.goto('/ar/read/22/end/');
  await expect(page.locator('.issue-nav-next')).toHaveCount(0);
});

test('the archive page keeps its viewer and offers the reader', async ({ page }) => {
  await page.goto('/ar/archive/21/');
  await expect(page.locator('.viewer')).toHaveCount(1);
  await expect(page.locator('a', { hasText: 'نزّل PDF' })).toHaveAttribute('href', '/archive/21/issue.pdf');
  await page.locator('a', { hasText: 'اقرأ العدد' }).click();
  await expect(page).toHaveURL(/\/ar\/read\/21\/$/);
});

test('the end screen marks only what this reader finished, and its links go to the file', async ({ page }) => {
  await page.goto('/ar/read/21/end/');
  await hydrated(page, '.end-list');
  await expect(page.locator('.end-list .reader-sec')).toHaveCount(5);
  await expect(page.locator('.end-read')).toHaveCount(0);
  await expect(page.locator('.end-hard')).toContainText('مبنى 68');
  await expect(page.locator('.end-list a[href*="/read/21/?p=5&s=21-musab"]')).toHaveCount(1);
  await page.goto('/ar/issue/21/musab-the-message-that-changed-the-path/');
  await page.locator('.story-end').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 600);
  await expect(page.locator('.read-progress')).toHaveAttribute('aria-valuenow', /9\d|100/);
  await page.goto('/ar/read/21/end/');
  await expect(page.locator('.end-read')).toHaveCount(1);
  await expect(page.locator('.reader-sec[data-read="true"]')).toContainText('تجربتي');
  await expect(page.locator('.end-line')).toContainText('1 من 5');
});

test('an issue without stories ends plainly', async ({ page }) => {
  await page.goto('/ar/read/3/end/');
  await expect(page.locator('.reader-line')).toContainText('8 صفحات');
  await expect(page.locator('.end-hard')).toContainText('21');
});

/* ---------- Position ---------- */

test('a return offers to continue with a quiet link and does not jump', async ({ page }) => {
  await open(page, '/ar/read/21/?p=5');
  await page.goto('about:blank');
  await open(page, '/ar/read/21/');
  await expect(page.locator(openPage(1))).toBeVisible();
  const go = page.locator('.rd-continue a');
  await expect(go).toContainText('الصفحة 5');
  await go.click();
  await expect(page.locator(openPage(5))).toBeVisible();
  await expect(page.locator('.rd-continue')).toHaveCount(0);
});

test('state stored before the reader existed does no harm', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('tullabiya:v1:state', JSON.stringify({ v: 1, userId: 'old', profile: null, favorites: { sections: [], units: [] }, progress: {}, votes: {}, hunts: {}, reactions: {}, submissions: [], upvotes: [], registrations: [], reminders: [], saved: [] }));
    }
  });
  await open(page, '/ar/read/21/');
  await expect(page.locator('.rd-continue')).toHaveCount(0);
  await openPanel(page, 'notes');
  await expect(page.locator('[data-notes-empty]')).toBeVisible();
});

/* ---------- Hard copy ---------- */

test('the hard copy page says where and when, and nothing invented', async ({ page }) => {
  await page.goto('/ar/hard-copy/');
  await expect(page.locator('main')).toContainText('العدد 21');
  await expect(page.locator('main')).toContainText('مبنى 68، جامعة الملك فهد للبترول والمعادن');
  await expect(page.locator('.hard-hours')).toContainText('في أي وقت');
  await expect(page.locator('main a[href^="mailto:"]')).toHaveAttribute('href', 'mailto:dsa-mag@kfupm.edu.sa');
  await expect(page.locator('main form, main input')).toHaveCount(0);
  await page.goto('/en/hard-copy/');
  await expect(page.locator('main h2')).toHaveText('Building 68, KFUPM');
  await expect(page.locator('.hard-hours')).toContainText('Anytime');
});

test('the footer reaches the hard copy', async ({ page }) => {
  await page.goto('/ar/calendar/');
  await page.locator('.foot a[href="/ar/hard-copy/"]').click();
  await expect(page.locator('h1')).toHaveText('النسخة الورقية');
});

/* ---------- Marks ---------- */

async function markText(page: Page, n = 3) {
  await tool(page, 'mark').click();
  const box = await pageBox(page, n);
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.33, { steps: 6 });
  await page.mouse.up();
  await tool(page, 'mark').click();
}

test('a drag on text snaps to whole lines of words, and survives a reload', async ({ page }) => {
  await open(page, '/ar/read/21/?p=3');
  await page.locator('.page-photo').first().waitFor({ state: 'attached' });
  await markText(page);
  const marks = page.locator('.page-mark');
  await expect(marks.first()).toBeAttached();
  const n = await marks.count();
  expect(n).toBeGreaterThan(1);
  const first = (await marks.nth(0).boundingBox())!;
  const second = (await marks.nth(1).boundingBox())!;
  expect(second.y, 'the next line sits below').toBeGreaterThan(first.y);
  expect(second.width / (await pageBox(page, 3)).width).toBeGreaterThan(0.25);
  await page.reload();
  await page.locator(`${stage} img`).first().waitFor();
  await expect(marks).toHaveCount(n);
});

test('without layout data a drag is a free rectangle, and a tap on the page opens no photo', async ({ page }) => {
  await page.route(/\/l\d\d\.json/, (r) => r.fulfill({ status: 404, body: '' }));
  await open(page, '/ar/read/21/?p=3');
  await expect(page.locator('.page-photo')).toHaveCount(0);
  await markText(page);
  await expect(page.locator('.page-mark')).toHaveCount(1);
});

test('marks stay aligned with the page at every zoom, and sit above the painted page', async ({ page }) => {
  await open(page, '/ar/read/21/?p=3');
  await page.locator('.page-photo').first().waitFor({ state: 'attached' });
  await markText(page);
  const mark = page.locator('.page-mark').first();
  const relative = async () => {
    const m = (await mark.boundingBox())!;
    const p = await pageBox(page, 3);
    return { x: (m.x - p.x) / p.width, y: (m.y - p.y) / p.height, w: m.width / p.width };
  };
  const at1x = await relative();
  await page.getByRole('button', { name: LABEL.ar.zoomIn }).click();
  await expect.poll(() => sheetScale(page)).toBeCloseTo(2);
  await page.waitForTimeout(450);
  const at2x = await relative();
  expect(at2x.x).toBeCloseTo(at1x.x, 2);
  expect(at2x.y).toBeCloseTo(at1x.y, 2);
  expect(at2x.w).toBeCloseTo(at1x.w, 2);
  const order = await page.evaluate(() => [getComputedStyle(document.querySelector('.page-canvas')!).zIndex, getComputedStyle(document.querySelector('.page-mark')!).zIndex].map(Number));
  expect(order[1], 'marks above the painted page').toBeGreaterThan(order[0]);
});

test('out of highlight mode a drag only moves the page', async ({ page }) => {
  await open(page, '/ar/read/21/?p=3');
  const box = await pageBox(page, 3);
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.page-mark')).toHaveCount(0);
});

test('tapping a mark opens it: comment as plain text, says it is private, sends, deletes', async ({ page }) => {
  await open(page, '/ar/read/21/?p=3');
  await page.locator('.page-photo').first().waitFor({ state: 'attached' });
  await markText(page);
  const m = (await page.locator('button.page-mark').boundingBox())!;
  await page.mouse.click(m.x + m.width / 2, m.y + m.height / 2);
  const sheet = page.locator('.note-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.note-private')).toContainText('خاصة');
  await sheet.locator('textarea').fill('<img src=x onerror="window.__xss=1">رأي <b>مهم</b>');
  await sheet.getByRole('button', { name: LABEL.ar.save }).click();
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();

  await openPanel(page, 'notes');
  const row = page.locator('.rd-note');
  await expect(row).toContainText('رأي مهم');
  await expect(row.locator('.mark-crop')).toHaveCSS('background-image', /p03\.jpg/);
  await row.click();
  await expect(page.locator('.note-sheet textarea')).toHaveValue('رأي مهم');
  await page.locator('.note-sheet').getByRole('button', { name: 'أرسل التعليق إلى المحررين' }).click();
  await expect(page.locator('.note-sheet [data-sent]')).toContainText('قيد المراجعة');
  await page.locator('.note-sheet').getByRole('button', { name: LABEL.ar.del }).click();
  await expect(page.locator('.page-mark')).toHaveCount(0);
  await page.goto('/ar/my/');
  await hydrated(page, '.my');
  await expect(page.locator('.subs')).toContainText('رأي مهم');
  await expect(page.locator('.subs .tag')).toContainText('قيد المراجعة');
});

test('My Corner lists marks by issue and page, as crops, linking back', async ({ page }) => {
  await open(page, '/ar/read/21/?p=3');
  await page.locator('.page-photo').first().waitFor({ state: 'attached' });
  await markText(page);
  await page.goto('/ar/my/');
  await hydrated(page, '.my');
  const notes = page.locator('.my-notes');
  await expect(notes).toBeVisible();
  await expect(notes.locator('h3')).toContainText('العدد 21');
  await expect(notes.locator('.mark-crop')).toHaveCSS('background-image', /p03\.jpg/);
  await notes.locator('a[href="/ar/read/21/?p=3"]').click();
  await expect(page.locator(openPage(3))).toBeVisible();
  await expect(page.locator('.page-mark').first()).toBeAttached();
});

test('My Corner says so when there is nothing yet', async ({ page }) => {
  await page.goto('/en/my/');
  await hydrated(page, '.my');
  await expect(page.locator('[data-notes-empty]')).toBeVisible();
});

/* ---------- Photos on the page ---------- */

async function openPhoto(page: Page, path: string, i = 0) {
  await open(page, path);
  const hit = page.locator('.page-photo').nth(i);
  await hit.waitFor({ state: 'attached' });
  await hit.focus();
  await page.keyboard.press('Enter');
  await page.locator('.photo-viewer [data-at="cur"] .photo-box').waitFor();
}

test('photos on the page have names, open by keyboard, zoom only as far as they allow, and close with Escape', async ({ page }) => {
  await open(page, '/ar/read/21/?p=4');
  await page.locator('.page-photo').first().waitFor({ state: 'attached' });
  await expect(page.locator('.page-photo').first()).toHaveAttribute('aria-label', 'صورة 1 في الصفحة 4');
  await openPhoto(page, '/ar/read/21/?p=3');
  const v = page.locator('.photo-viewer');
  await expect(v.locator('.photo-more li')).toHaveCount(3, { timeout: 2000 });
  await page.keyboard.press('ArrowLeft');
  await expect(v.locator('.photo-count')).toContainText('2 من');
  await page.waitForTimeout(400);
  const zoomIn = v.locator('[data-zoom-in]');
  for (let k = 0; k < 6 && !(await zoomIn.isDisabled()); k++) {
    await zoomIn.click();
    await page.waitForTimeout(280);
  }
  await expect(zoomIn).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(v).toHaveCount(0);
  await expect(page).toHaveURL(/\?p=3$/);
});

for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
  test.describe(`photos at ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });
    test('are never distorted, use the original file, and are not blown up', async ({ page, isMobile }) => {
      test.skip(isMobile !== (size.width === 390), 'each size on its own project');
      test.setTimeout(60_000);
      for (const n of [2, 8]) {
        await open(page, `/ar/read/21/?p=${n}`);
        await page.locator(`[data-photo-page="${n}"]`).first().waitFor({ state: 'attached' });
        const count = await page.locator(`[data-photo-page="${n}"]`).count();
        for (let i = 0; i < count; i++) {
          await page.locator(`[data-photo-page="${n}"]`).nth(i).focus();
          await page.keyboard.press('Enter');
          await page.locator('.photo-viewer [data-at="cur"] .photo-img[data-loaded="true"]').waitFor();
          await page.waitForTimeout(450);
          const r = await page.evaluate(() => {
            const box = document.querySelector('.photo-viewer [data-at="cur"] .photo-box')!.getBoundingClientRect();
            const img = document.querySelector<HTMLImageElement>('.photo-viewer [data-at="cur"] .photo-img')!;
            const rect = img.getBoundingClientRect();
            return { boxW: box.width, boxH: box.height, nw: img.naturalWidth, nh: img.naturalHeight, iw: rect.width, ih: rect.height, turned: img.style.transform.includes('rotate(90') || img.style.transform.includes('rotate(270') };
          });
          const source = r.turned ? r.nh / r.nw : r.nw / r.nh;
          expect(Math.abs(r.boxW / r.boxH - source) / source, `page ${n} photo ${i + 1}`).toBeLessThan(0.01);
          expect(Math.abs(r.iw / r.ih - source) / source).toBeLessThan(0.01);
          const dpr = await page.evaluate(() => devicePixelRatio);
          const sourceW = r.turned ? r.nh : r.nw;
          expect((r.boxW * dpr) / sourceW, 'never past 1.5 device pixels per source pixel').toBeLessThanOrEqual(1.51);
          await page.keyboard.press('Escape');
          await page.locator('.photo-viewer').waitFor({ state: 'detached' });
        }
      }
    });
  });
}

test('the page shows dimly behind the photo, and a click outside closes it', async ({ page }) => {
  await openPhoto(page, '/ar/read/21/?p=3');
  await page.waitForTimeout(500);
  const color = await page.locator('.photo-bg').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(color).toMatch(/(oklab|rgba|color)/);
  const box = (await page.locator('.photo-viewer [data-at="cur"] .photo-box').boundingBox())!;
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, Math.min(vp.height - 80, box.y + box.height + 30));
  await expect(page.locator('.photo-viewer')).toHaveCount(0);
});

test('a story in a photo\'s list goes to its place in the file', async ({ page }) => {
  await openPhoto(page, '/ar/read/21/?p=3');
  await page.locator('.photo-more summary').click();
  await page.locator('.photo-more button').first().click();
  await expect(page.locator('.photo-viewer')).toHaveCount(0);
  await expect(page).toHaveURL(/\?p=3&s=/);
  await expect.poll(() => sheetScale(page)).toBeGreaterThan(1);
});

test('the back button and the close button both close a photo and stay on the page', async ({ page }) => {
  await openPhoto(page, '/ar/read/21/?p=3');
  await page.goBack();
  await expect(page.locator('.photo-viewer')).toHaveCount(0);
  await expect(page).toHaveURL(/\/read\/21\/\?p=3$/);
  await page.locator('.page-photo').first().focus();
  await page.keyboard.press('Enter');
  await page.locator('.photo-viewer').getByRole('button', { name: LABEL.ar.close }).click();
  await expect(page.locator('.photo-viewer')).toHaveCount(0);
  await expect(page).toHaveURL(/\/read\/21\/\?p=3$/);
});

test('focus stays inside the photo view', async ({ page }) => {
  await openPhoto(page, '/ar/read/21/?p=3');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const a = document.activeElement;
      return !a || a === document.body || !!a.closest('.photo-viewer');
    });
    expect(inside).toBe(true);
  }
});

/* ---------- Without JavaScript ---------- */

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('real anchors to every page image and the PDF, the stories, and the neighbors', async ({ page }) => {
    await page.goto('/ar/read/21/?p=3#p3');
    await expect(page.locator('.rd-plain')).toBeVisible();
    await expect(page.locator('.rd-plain-pages > li')).toHaveCount(8);
    await expect(page.locator('#p3 > a')).toHaveAttribute('href', '/archive/21/p03.jpg');
    await expect(page.locator('#p3 ul a')).toHaveCount(3);
    await expect(page.locator('.rd-plain a[download]')).toHaveAttribute('href', '/archive/21/issue.pdf');
    await expect(page.locator('.rd-plain-links a[rel="next"]')).toHaveAttribute('href', '/ar/read/22/');
    await page.goto('/ar/read/21/end/');
    await expect(page.locator('.end-list a')).toHaveCount(18);
  });
});

/* ---------- Layout and accessibility ---------- */

for (const lang of ['ar', 'en'] as const) {
  test(`nothing overflows, and every control is a real target (${lang})`, async ({ page, isMobile }) => {
    test.setTimeout(90_000);
    for (const r of ['/read/21/', '/read/21/?p=3', '/read/3/', '/read/21/end/', '/read/3/end/', '/hard-copy/']) {
      await page.goto(`/${lang}${r}`);
      await page.waitForTimeout(250);
      await expectNoHorizontalScroll(page);
    }
    if (!isMobile) return;
    await open(page, `/${lang}/read/21/?p=2`);
    const small = await page.locator('.rd-top a, .rd-top button, .rd-bottom a, .rd-bottom button').evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect()).filter((b) => b.width < 44 || b.height < 44).map((b) => `${b.width}x${b.height}`),
    );
    expect(small).toEqual([]);
    const bottom = (await page.locator('.rd-bottom').boundingBox())!;
    expect(bottom.y + bottom.height).toBe(page.viewportSize()!.height);
  });
}

for (const lang of ['ar', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe on the reader and its open states (${lang} ${theme})`, async ({ page, isMobile }) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ colorScheme: theme });
      const check = async (label: string) => {
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).disableRules(['region']).analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html?.slice(0, 120)}`)).toEqual([]);
      };
      await open(page, `/${lang}/read/21/?p=3`);
      await page.locator('.page-photo').first().waitFor({ state: 'attached' });
      await page.waitForTimeout(300);
      await check('page');
      for (const name of ['contents', 'pages', 'notes', 'more']) {
        await openPanel(page, name);
        await page.waitForTimeout(500);
        await check(name);
        await closePanel(page, !!isMobile);
      }
      await page.locator('.page-photo').first().focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      await check('photo');
      await page.keyboard.press('Escape');
    });
  }
}

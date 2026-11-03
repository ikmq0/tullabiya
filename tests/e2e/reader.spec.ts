import { test, expect, type CDPSession, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectNoHorizontalScroll, hydrated } from './helpers';

const stage = '.rd-app .viewer-stage';
const openPage = (n: number) => `.viewer-panel[data-at="cur"] img[data-page="${n}"]`;
const sheetSel = '.viewer-panel[data-at="cur"] .viewer-sheet';
const zoomed = (page: Page) => page.locator(`${stage}[data-zoomed="true"]`);
const sheetScale = (page: Page) => page.locator(sheetSel).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
const trackX = (page: Page) => page.locator(`${stage} .viewer-track`).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
const LABEL = {
  ar: { contents: 'الفهرس', pages: 'الصفحات', mark: 'ظلّل', notes: 'ملاحظاتي', more: 'المزيد', zoomIn: 'كبّر الصفحة', zoomOut: 'صغّر الصفحة', next: 'الصفحة التالية', prev: 'الصفحة السابقة', close: 'إغلاق', del: 'احذف', save: 'احفظ' },
  en: { contents: 'Contents', pages: 'Pages', mark: 'Highlight', notes: 'Notes', more: 'More', zoomIn: 'Zoom in on the page', zoomOut: 'Zoom out of the page', next: 'Next page', prev: 'Previous page', close: 'Close', del: 'Delete', save: 'Save' },
};
const tool = (page: Page, name: string) => page.locator('.rd-bottom .rd-tool', { hasText: name });

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator(`${stage} img`).first().waitFor();
  // The app listens once it has mounted; the zoom buttons exist only then.
  await page.locator('.rd-top .rd-btn').first().waitFor();
}

/* ---------- Touch, through the browser's real input pipeline ---------- */

type Touch = { x: number; y: number; id?: number };
const cdp = (page: Page) => page.context().newCDPSession(page);
const send = (c: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', touchPoints: Touch[]) => c.send('Input.dispatchTouchEvent', { type, touchPoints });

/** Drags one finger, keeping it down at the end unless told to lift. */
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
/** A spot on the page clear of any photo: the footer strip of the page. */
async function pageBox(page: Page, n: number) {
  return (await page.locator(openPage(n)).boundingBox())!;
}
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
  await expect(page.locator('.sheet, .onboarding')).toHaveCount(0);
  await expect(page.locator('.rd-top h1')).toHaveText('العدد 21');
  await expect(page.locator('.rd-count')).toHaveText('صفحة 1 من 8');
  await expect(page.locator('.rd-top a')).toHaveAttribute('href', '/ar/');
  for (const name of Object.values(LABEL.ar).slice(0, 5)) await expect(tool(page, name)).toBeVisible();
  const box = (await page.locator('.rd-app').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.width).toBe(vp.width);
  expect(box.height).toBe(vp.height);
  const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1 && getComputedStyle(document.documentElement).overflow !== 'hidden');
  expect(scrolls).toBe(false);
});

test('/read/ opens the current issue', async ({ page }) => {
  await page.goto('/ar/read/');
  await expect(page).toHaveURL(/\/ar\/read\/21\/$/);
  await page.locator(`${stage} img`).first().waitFor();
});

test('English opens too, reading direction aside', async ({ page }) => {
  await open(page, '/en/read/21/');
  await expect(page.locator('.rd-top h1')).toHaveText('Issue 21');
  await expect(page.locator('.rd-count')).toHaveText('Page 1 of 8');
});

test('a back issue opens the same way', async ({ page }) => {
  await open(page, '/ar/read/3/');
  await expect(page.locator(openPage(1))).toBeVisible();
  await expect(page.locator('.rd-section')).toHaveCount(0);
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
  await page.waitForTimeout(350);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator(openPage(1))).toBeVisible();
});

test('the bar turns pages, keeps the place in the address, and leaves one page at rest', async ({ page, isMobile }) => {
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
    const a = await pageBox(page, 2);
    const b = await pageBox(page, 3);
    expect(a.x).toBeGreaterThan(b.x);
    await expect(page.locator('.rd-count')).toContainText('2');
    await expect(page.locator('.rd-count')).toContainText('3');
  });
}

test('a page link opens that page, from the query or the hash, and only nearby pages load', async ({ page, isMobile }) => {
  const asked = new Set<string>();
  page.on('request', (r) => {
    const m = /\/archive\/21\/([pz]\d\d)\.jpg/.exec(r.url());
    if (m) asked.add(m[1]);
  });
  await open(page, '/ar/read/21/?p=3');
  await expect(page.locator(openPage(3))).toBeVisible();
  await page.waitForLoadState('networkidle');
  for (const far of ['p06', 'p07', 'p08']) expect(asked.has(far), `${far} of ${[...asked]}`).toBe(false);
  expect([...asked].some((x) => x.startsWith('z')), 'no sharper image before zoom').toBe(false);
  if (isMobile) expect(asked.has('p05')).toBe(false);
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
    const cur = await pageBox(page, 3);
    expect(next.x + next.width, 'in Arabic the next page waits on the left').toBeLessThanOrEqual(cur.x + 1);
    await page.waitForTimeout(150); // The finger stops, so no flick.
    await send(c, 'touchEnd', []);
    await expect.poll(() => trackX(page)).toBeCloseTo(0);
    await expect(page.locator(openPage(3))).toBeVisible();
  });

  test('in Arabic a long drag to the right turns forward', async ({ page }) => {
    const { c, box, mid } = await ready(page, '/ar/read/21/?p=3', 3);
    await drag(page, c, { x: box.x + 40, y: mid.y }, { x: box.x + box.width - 40, y: mid.y });
    await expect(page.locator(openPage(4))).toBeVisible();
    await expect(page).toHaveURL(/\?p=4$/);
    await expect.poll(() => trackX(page)).toBeCloseTo(0);
    await expect(page.locator('.rd-count')).toHaveText('صفحة 4 من 8');
  });

  test('in Arabic a long drag to the left turns back', async ({ page }) => {
    const { c, box, mid } = await ready(page, '/ar/read/21/?p=3', 3);
    await drag(page, c, { x: box.x + box.width - 40, y: mid.y }, { x: box.x + 40, y: mid.y });
    await expect(page.locator(openPage(2))).toBeVisible();
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

  test('the first page rubber-bands and stays', async ({ page }) => {
    const { c, box, mid } = await ready(page, '/ar/read/21/', 1);
    await drag(page, c, { x: box.x + box.width - 40, y: mid.y }, { x: box.x + 40, y: mid.y }, { lift: false });
    const during = Math.abs(await trackX(page));
    expect(during).toBeGreaterThan(0);
    expect(during).toBeLessThan((box.width - 80) / 2);
    await page.waitForTimeout(150);
    await send(c, 'touchEnd', []);
    await expect.poll(() => trackX(page)).toBeCloseTo(0);
    await expect(page.locator(openPage(1))).toBeVisible();
  });

  test('the last page rubber-bands too', async ({ page }) => {
    const { c, box, mid } = await ready(page, '/ar/read/21/?p=8', 8);
    await drag(page, c, { x: box.x + 40, y: mid.y }, { x: box.x + box.width - 40, y: mid.y }, { lift: false });
    expect(Math.abs(await trackX(page))).toBeLessThan((box.width - 80) / 2);
    await page.waitForTimeout(150);
    await send(c, 'touchEnd', []);
    await expect(page.locator(openPage(8))).toBeVisible();
  });

  test('catching a settling page carries on from where it is', async ({ page }) => {
    const { c, box, mid } = await ready(page, '/ar/read/21/?p=3', 3);
    await drag(page, c, { x: box.x + 40, y: mid.y }, { x: box.x + box.width - 40, y: mid.y }, { steps: 6 });
    await send(c, 'touchStart', [{ x: mid.x, y: mid.y }]); // Mid-slide: the turn has not landed.
    const caught = await trackX(page);
    expect(Math.abs(caught)).toBeGreaterThan(0);
    await page.waitForTimeout(150);
    await send(c, 'touchMove', [{ x: mid.x, y: mid.y }]);
    await send(c, 'touchEnd', []);
    await expect.poll(() => trackX(page)).toBeCloseTo(0);
    await expect(page.locator('.viewer-panel[data-at="next"], .viewer-panel[data-at="prev"]')).toHaveCount(0);
  });

  test('pinch zooms about the fingers, and a zoomed page pans instead of turning', async ({ page }) => {
    const { c, box, mid } = await ready(page, '/ar/read/21/?p=2', 2);
    await send(c, 'touchStart', [{ x: mid.x - 40, y: mid.y, id: 0 }, { x: mid.x + 40, y: mid.y, id: 1 }]);
    for (let d = 45; d <= 120; d += 15) {
      await send(c, 'touchMove', [{ x: mid.x - d, y: mid.y, id: 0 }, { x: mid.x + d, y: mid.y, id: 1 }]);
      await page.waitForTimeout(16);
    }
    await send(c, 'touchEnd', []);
    await expect(zoomed(page)).toHaveCount(1);
    const z = await sheetScale(page);
    expect(z).toBeGreaterThan(2.5);
    expect(z).toBeLessThanOrEqual(4);
    await expect(page.locator(openPage(2))).toHaveAttribute('src', /z02\.jpg$/);
    const before = (await page.locator(sheetSel).boundingBox())!;
    await drag(page, c, { x: mid.x - 80, y: mid.y }, { x: mid.x + 80, y: mid.y });
    await page.waitForTimeout(350);
    const after = (await page.locator(sheetSel).boundingBox())!;
    expect(after.x, 'pans with the finger').toBeGreaterThan(before.x);
    await expect(page.locator(openPage(2))).toBeVisible();
    await expect(page.locator('.viewer-panel[data-at="next"]')).toHaveCount(0);
    // And stops at the page's edge however far it goes.
    await drag(page, c, { x: mid.x - 100, y: mid.y }, { x: mid.x + 100, y: mid.y });
    await drag(page, c, { x: mid.x - 100, y: mid.y }, { x: mid.x + 100, y: mid.y });
    const edge = (await page.locator(sheetSel).boundingBox())!;
    expect(edge.x).toBeLessThanOrEqual(box.x + 1);
  });

  test('pinching in far stops at 4x; pinching back out returns to the page', async ({ page }) => {
    const { c, mid } = await ready(page, '/ar/read/21/?p=2', 2);
    await send(c, 'touchStart', [{ x: mid.x - 20, y: mid.y, id: 0 }, { x: mid.x + 20, y: mid.y, id: 1 }]);
    for (let d = 30; d <= 180; d += 30) {
      await send(c, 'touchMove', [{ x: mid.x - d, y: mid.y, id: 0 }, { x: mid.x + d, y: mid.y, id: 1 }]);
      await page.waitForTimeout(16);
    }
    await send(c, 'touchEnd', []);
    expect(await sheetScale(page)).toBeCloseTo(4);
    await send(c, 'touchStart', [{ x: mid.x - 180, y: mid.y, id: 0 }, { x: mid.x + 180, y: mid.y, id: 1 }]);
    for (let d = 150; d >= 20; d -= 30) {
      await send(c, 'touchMove', [{ x: mid.x - d, y: mid.y, id: 0 }, { x: mid.x + d, y: mid.y, id: 1 }]);
      await page.waitForTimeout(16);
    }
    await send(c, 'touchEnd', []);
    await expect(zoomed(page)).toHaveCount(0);
  });

  test('a double tap toggles zoom; a single tap hides and shows both bars', async ({ page }) => {
    const { c, box } = await ready(page, '/ar/read/21/?p=2', 2);
    const spot = quietSpot(box);
    await tap(c, spot);
    await page.waitForTimeout(60);
    await tap(c, spot);
    await expect(zoomed(page)).toHaveCount(1);
    await page.waitForTimeout(400);
    await tap(c, spot);
    await page.waitForTimeout(60);
    await tap(c, spot);
    await expect(zoomed(page)).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(page.locator('.rd-bottom')).toBeVisible();
    await tap(c, spot);
    await expect(page.locator('.rd-bottom')).toBeHidden();
    await expect(page.locator('.rd-top')).toBeHidden();
    await page.waitForTimeout(400);
    await tap(c, spot);
    await expect(page.locator('.rd-bottom')).toBeVisible();
    await expect(page.locator('.rd-top')).toBeVisible();
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

  test('swiping moves between the photos of a page', async ({ page }) => {
    const { c } = await ready(page, '/ar/read/21/?p=3', 3);
    const photo = (await page.locator('.page-photo').first().boundingBox())!;
    await tap(c, { x: photo.x + photo.width / 2, y: photo.y + photo.height / 2 });
    await expect(page.locator('.photo-count')).toContainText('1 من');
    const box = (await page.locator('.photo-stage').boundingBox())!;
    const y = box.y + box.height / 2;
    await drag(page, c, { x: box.x + 40, y }, { x: box.x + box.width - 40, y });
    await expect(page.locator('.photo-count')).toContainText('2 من');
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

  test('in highlight mode a finger marks instead of moving the page, snapping to the words', async ({ page }) => {
    const { c, box } = await ready(page, '/ar/read/21/?p=3', 3);
    await tool(page, LABEL.ar.mark).click();
    await drag(page, c, { x: box.x + box.width * 0.9, y: box.y + box.height * 0.25 }, { x: box.x + box.width * 0.72, y: box.y + box.height * 0.33 });
    await expect(page.locator('.page-mark').first()).toBeAttached();
    expect(await page.locator('.page-mark').count(), 'one rectangle per line').toBeGreaterThan(1);
    await expect(page.locator(openPage(3))).toBeVisible();
    await expect(page.locator('.rd-count')).toHaveText('صفحة 3 من 8 ');
  });
});

/* ---------- Zoom ---------- */

for (const lang of ['ar', 'en'] as const) {
  test(`zoom has buttons and keys, and turning a page resets it (${lang})`, async ({ page }) => {
    const L = LABEL[lang];
    await open(page, `/${lang}/read/21/?p=2`);
    await expect(page.getByRole('button', { name: L.zoomOut })).toBeDisabled();
    await page.getByRole('button', { name: L.zoomIn }).click();
    await expect(zoomed(page)).toHaveCount(1);
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

test('the sharper image loads only once zoomed, in place, without moving the page', async ({ page, isMobile }) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (/\/z\d\d\.jpg/.test(r.url())) asked.push(r.url());
  });
  await open(page, '/ar/read/21/?p=4');
  await page.waitForLoadState('networkidle');
  expect(asked).toEqual([]);
  const img = page.locator(openPage(4));
  await expect(img).toHaveAttribute('src', /p04\.jpg$/);
  await page.getByRole('button', { name: LABEL.ar.zoomIn }).click();
  await expect.poll(() => sheetScale(page)).toBeCloseTo(2);
  const before = (await img.boundingBox())!;
  await expect(img).toHaveAttribute('src', /z04\.jpg$/);
  const after = (await img.boundingBox())!;
  expect(Math.abs(after.width - before.width)).toBeLessThan(1);
  expect(Math.abs(after.height - before.height)).toBeLessThan(1);
  if (!isMobile) expect(asked.some((u) => u.includes('z05')), 'the facing page too').toBe(true);
});

test('without the sharper file the regular page stays', async ({ page }) => {
  await page.route(/\/z\d\d\.jpg/, (r) => r.fulfill({ status: 404, body: '' }));
  await open(page, '/ar/read/21/?p=4');
  await page.getByRole('button', { name: LABEL.ar.zoomIn }).click();
  await expect.poll(() => sheetScale(page)).toBeCloseTo(2);
  await page.waitForTimeout(300);
  await expect(page.locator(openPage(4))).toHaveAttribute('src', /p04\.jpg$/);
  await expect(page.locator(openPage(4))).toBeVisible();
});

test('a double click zooms in on the spot and back out; a mouse drag pans within the edges', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the touch version is above');
  await open(page, '/ar/read/21/?p=8');
  const box = await pageBox(page, 8);
  const at = quietSpot(box);
  await page.mouse.dblclick(at.x, at.y);
  await expect(zoomed(page)).toHaveCount(1);
  await expect.poll(() => sheetScale(page)).toBeCloseTo(2.5);
  await page.mouse.dblclick(at.x, at.y);
  await expect(zoomed(page)).toHaveCount(0);
});

/* ---------- Contents and pages ---------- */

test('the contents follow the magazine, jump to the printed page, and mark the current section', async ({ page }) => {
  await open(page, '/ar/read/21/?p=4');
  await expect(page.locator('.rd-section')).toContainText('ضيف الثلاثين');
  await tool(page, LABEL.ar.contents).click();
  const sheet = page.locator('.rd-sheet');
  await expect(sheet.locator('.rd-sec')).toHaveCount(5);
  await expect(sheet.locator('.rd-sec[data-here="true"]')).toContainText('ضيف الثلاثين');
  await expect(sheet.locator('.rd-sec a[aria-current="true"]')).toContainText('بدر');
  await expect(sheet.locator('.rd-sec', { hasText: 'الأخبار' }).locator('.rd-row')).toHaveCount(5);
  await expect(sheet.getByText('على الموقع فقط')).toHaveCount(1);
  // The story's title jumps to its printed page, not to the web article.
  await sheet.locator('.rd-sec a', { hasText: 'مصعب' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(openPage(5))).toBeVisible();
  await expect(page.locator('.rd-section')).toContainText('تجربتي');
});

test('the current page lists its stories, each with a small link to the web article', async ({ page }) => {
  await open(page, '/ar/read/21/?p=5');
  await tool(page, LABEL.ar.contents).click();
  const here = page.locator('.rd-here');
  await expect(here).toContainText('مصعب');
  await here.locator('a.rd-web').first().click();
  await expect(page).toHaveURL(/\/ar\/issue\/21\/musab-the-message/);
  const see = page.locator('.story-see a');
  await expect(see).toHaveAttribute('href', '/ar/read/21/?p=5#p5');
  await see.click();
  await expect(page.locator(openPage(5))).toBeVisible();
});

test('thumbnails sit under their sections and jump; so does the page number', async ({ page }) => {
  await open(page, '/ar/read/21/?p=2');
  await tool(page, LABEL.ar.pages).click();
  await expect(page.locator('.rd-thumb')).toHaveCount(8);
  await expect(page.locator('.rd-thumb-group h3')).toHaveText(['الأخبار', 'ضيف الثلاثين', 'تجربتي', 'مشاركاتي', 'الأخيرة']);
  await page.locator('.rd-thumb').nth(5).click();
  await expect(page.locator(openPage(6))).toBeVisible();
  await tool(page, LABEL.ar.pages).click();
  await page.locator('#rd-jump').fill('8');
  await page.keyboard.press('Enter');
  await expect(page.locator(openPage(8))).toBeVisible();
});

test('a back issue has a plain thumbnails outline', async ({ page }) => {
  await open(page, '/ar/read/3/');
  await tool(page, LABEL.ar.contents).click();
  await expect(page.locator('.rd-thumb')).toHaveCount(8);
  await expect(page.locator('.rd-thumb-group h3, .rd-sec')).toHaveCount(0);
});

test('the sheets close with Escape and leave the page where it was', async ({ page }) => {
  await open(page, '/ar/read/21/?p=4');
  await tool(page, LABEL.ar.contents).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.rd-sheet')).toHaveCount(0);
  await expect(page.locator(openPage(4))).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page).not.toHaveURL(/\?p=4$/);
});

test('More holds the PDF, the hard copy, the end and the neighboring issues', async ({ page }) => {
  await open(page, '/ar/read/21/');
  await tool(page, LABEL.ar.more).click();
  const more = page.locator('.rd-more');
  await expect(more.locator('a[download]')).toHaveAttribute('href', '/archive/21/issue.pdf');
  await expect(more.locator('a[href="/ar/hard-copy/"]')).toHaveCount(1);
  await expect(more.locator('a[href="/ar/read/21/end/"]')).toHaveCount(1);
  await expect(more.locator('a[rel="prev"]')).toHaveAttribute('href', '/ar/read/20/');
  await expect(more.locator('a[rel="next"]')).toHaveAttribute('href', '/ar/read/22/');
});

test('a language switch keeps the page', async ({ page }) => {
  await open(page, '/ar/read/21/?p=4');
  await tool(page, LABEL.ar.more).click();
  await page.locator('.rd-more .lang').click();
  await expect(page).toHaveURL(/\/en\/read\/21\/\?p=4$/);
  await expect(page.locator(openPage(4))).toBeVisible();
});

/* ---------- Ends and links ---------- */

test('the last page and the last story both lead to the end screen', async ({ page }) => {
  await open(page, '/ar/read/21/?p=8');
  await page.locator('.rd-bottom a.rd-btn').click();
  await expect(page).toHaveURL(/\/ar\/read\/21\/end\/$/);
  await expect(page.locator('h1')).toContainText('هنا ينتهي العدد 21');
  await page.goto('/ar/issue/21/discover-consulting-with-bcg/');
  const next = page.locator('.story-seq-next');
  await expect(next).toHaveAttribute('href', '/ar/read/21/end/');
});

test('stories follow the issue order, forward and back', async ({ page }) => {
  await page.goto('/en/issue/21/murshid-fifth-edition/');
  await expect(page.locator('.story-seq-prev')).toHaveAttribute('href', '/en/issue/21/orientation-2026/');
  await expect(page.locator('.story-seq-next')).toHaveAttribute('href', '/en/issue/21/advisory-council-2025-2026/');
  await page.goto('/en/issue/21/orientation-2026/');
  await expect(page.locator('.story-seq-prev')).toHaveCount(0);
});

test('a web-only story offers no printed page', async ({ page }) => {
  await page.goto('/ar/issue/21/research-day/');
  await expect(page.locator('.story-see')).toHaveCount(0);
  await expect(page.locator('.story-seq a')).toHaveCount(2);
});

test('story pages hold no reader machinery: no selection bar, no photo viewer', async ({ page }) => {
  await page.goto('/ar/issue/21/orientation-2026/');
  await expect(page.locator('.story-photo img')).toBeVisible();
  await expect(page.locator('.photo-open, .notes-bar, .photo-viewer, .story-photos')).toHaveCount(0);
});

test('the end screen walks the archive by number, past the current issue', async ({ page }) => {
  await page.goto('/ar/read/21/end/');
  await expect(page.locator('.issue-nav-prev')).toHaveAttribute('href', '/ar/read/20/');
  await expect(page.locator('.issue-nav-next')).toHaveAttribute('href', '/ar/read/22/');
  await page.goto('/ar/read/1/end/');
  await expect(page.locator('.issue-nav-prev')).toHaveCount(0);
  await expect(page.locator('.issue-nav-next')).toHaveAttribute('href', '/ar/read/2/');
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

test('the end screen marks only what this reader finished', async ({ page }) => {
  await page.goto('/ar/read/21/end/');
  await hydrated(page, '.end-list');
  await expect(page.locator('.end-list .reader-sec')).toHaveCount(5);
  await expect(page.locator('.end-read')).toHaveCount(0);
  await expect(page.locator('.end-line')).toHaveCount(0);
  await expect(page.locator('.end-hard')).toContainText('مبنى 68');
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
  await expect(page.locator('h1')).toContainText('3');
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
  await tool(page, LABEL.ar.notes).click();
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

/** Marks by dragging with the mouse, across a run of text in the right-hand column of page 3. */
async function markText(page: Page, n = 3) {
  await tool(page, LABEL.ar.mark).click();
  const box = await pageBox(page, n);
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.33, { steps: 6 });
  await page.mouse.up();
  await tool(page, LABEL.ar.mark).click();
}

test('a drag on text snaps to whole lines of words, and survives a reload', async ({ page }) => {
  await open(page, '/ar/read/21/?p=3');
  await markText(page);
  const marks = page.locator('.page-mark');
  await expect(marks.first()).toBeAttached();
  const n = await marks.count();
  expect(n).toBeGreaterThan(1);
  const first = (await marks.nth(0).boundingBox())!;
  const second = (await marks.nth(1).boundingBox())!;
  expect(second.y, 'the next line sits below').toBeGreaterThan(first.y);
  const page3 = await pageBox(page, 3);
  // The later lines run the column's full width, which a free rectangle of this drag would not.
  expect(second.width / page3.width).toBeGreaterThan(0.25);
  await page.reload();
  await page.locator(`${stage} img`).first().waitFor();
  await expect(marks).toHaveCount(n);
});

test('without layout data, or off the text, a drag is a free rectangle', async ({ page }) => {
  await page.route(/\/l\d\d\.json/, (r) => r.fulfill({ status: 404, body: '' }));
  await open(page, '/ar/read/21/?p=3');
  await expect(page.locator('.page-photo')).toHaveCount(0);
  await markText(page);
  await expect(page.locator('.page-mark')).toHaveCount(1);
});

test('marks stay aligned with the page at every zoom', async ({ page }) => {
  await open(page, '/ar/read/21/?p=3');
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
  const at2x = await relative();
  expect(at2x.x).toBeCloseTo(at1x.x, 2);
  expect(at2x.y).toBeCloseTo(at1x.y, 2);
  expect(at2x.w).toBeCloseTo(at1x.w, 2);
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

  await tool(page, LABEL.ar.notes).click();
  const row = page.locator('.rd-note');
  await expect(row).toContainText('رأي مهم');
  await expect(row.locator('.mark-crop')).toHaveCSS('background-image', /p03\.jpg/);
  await row.click();
  await expect(page.locator('.note-sheet textarea')).toHaveValue('رأي مهم');
  await page.locator('.note-sheet').getByRole('button', { name: 'أرسل التعليق إلى المحررين' }).click();
  await expect(page.locator('.note-sheet [data-sent]')).toContainText('قيد المراجعة');
  await page.locator('.note-sheet').getByRole('button', { name: LABEL.ar.del }).click();
  await expect(page.locator('.page-mark')).toHaveCount(0);
  // What was sent stays with the editors, pending.
  await page.goto('/ar/my/');
  await hydrated(page, '.my');
  await expect(page.locator('.subs')).toContainText('رأي مهم');
  await expect(page.locator('.subs .tag')).toContainText('قيد المراجعة');
});

test('My Corner lists marks by issue and page, as crops, linking back', async ({ page }) => {
  await open(page, '/ar/read/21/?p=3');
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

test('photos on the page have names, open by keyboard, zoom, and close with Escape', async ({ page }) => {
  await open(page, '/ar/read/21/?p=3');
  const first = page.locator('.page-photo').first();
  await expect(first).toHaveAttribute('aria-label', 'صورة 1 في الصفحة 3');
  await expect(page.locator('.page-photo')).toHaveCount(3);
  await first.focus();
  await page.keyboard.press('Enter');
  const v = page.locator('.photo-viewer');
  await expect(v).toBeVisible();
  await expect(v.locator('[data-at="cur"] .photo-crop')).toHaveAttribute('aria-label', 'صورة 1 في الصفحة 3');
  await expect(v.locator('.photo-info a')).toHaveCount(3);
  await page.keyboard.press('ArrowLeft');
  await expect(v.locator('.photo-count')).toContainText('2 من 3');
  await page.keyboard.press('+');
  await expect(v.locator('.photo-stage[data-zoomed="true"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(v).toHaveCount(0);
  await expect(page).toHaveURL(/\?p=3$/);
});

test('the photo comes from the sharper image, and falls back to the regular page', async ({ page }) => {
  await open(page, '/ar/read/21/?p=3');
  await page.locator('.page-photo').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.photo-viewer [data-at="cur"] .photo-crop')).toHaveCSS('background-image', /z03\.jpg/);
  await page.keyboard.press('Escape');
  await page.route(/\/z\d\d\.jpg/, (r) => r.fulfill({ status: 404, body: '' }));
  await open(page, '/ar/read/21/?p=4');
  await page.locator('.page-photo').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await expect(page.locator('.photo-viewer [data-at="cur"] .photo-crop')).toHaveCSS('background-image', /p04\.jpg/);
});

test('the back button and the close button both close a photo and stay on the page', async ({ page }) => {
  await open(page, '/ar/read/21/?p=3');
  await page.locator('.page-photo').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.photo-viewer')).toBeVisible();
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
  await open(page, '/ar/read/21/?p=3');
  await page.locator('.page-photo').first().focus();
  await page.keyboard.press('Enter');
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
    test(`axe on the reader and its open states (${lang} ${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      const L = LABEL[lang];
      await page.emulateMedia({ colorScheme: theme });
      const check = async (label: string) => {
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).disableRules(['region']).analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html?.slice(0, 120)}`)).toEqual([]);
      };
      await open(page, `/${lang}/read/21/?p=3`);
      await page.waitForTimeout(300);
      await check('page');
      for (const name of [L.contents, L.pages, L.notes, L.more]) {
        await tool(page, name).click();
        await page.waitForTimeout(500);
        await check(name);
        await page.keyboard.press('Escape');
      }
      await page.locator('.page-photo').first().focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      await check('photo');
      await page.keyboard.press('Escape');
    });
  }
}

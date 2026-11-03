import { describe, expect, it } from 'vitest';
import { clampPan, fitRegion, isDoubleTap, photoFit, pinchView, rectFromDrag, rubberBand, softPinch, softZoom, turnDecision, wantsTurnFromWheel, wheelZoomFactor, zoomAbout } from '~/lib/gesture';

const content = { w: 400, h: 560 };
const stage = { w: 400, h: 560 };

describe('pan clamp', () => {
  it('holds a page at rest in place at 1x', () => {
    expect(clampPan({ z: 1, x: 50, y: -50 }, content, stage)).toEqual({ z: 1, x: 0, y: 0 });
  });
  it('stops at the page edges when zoomed', () => {
    expect(clampPan({ z: 2, x: 999, y: -999 }, content, stage)).toEqual({ z: 2, x: 200, y: -280 });
    expect(clampPan({ z: 2, x: 30, y: 40 }, content, stage)).toEqual({ z: 2, x: 30, y: 40 });
  });
  it('allows no pan on an axis where the page still fits', () => {
    expect(clampPan({ z: 2, x: 90, y: 0 }, { w: 200, h: 200 }, { w: 400, h: 400 })).toEqual({ z: 2, x: 0, y: 0 });
  });
  it('keeps zoom within 1x to 4x', () => {
    expect(clampPan({ z: 9, x: 0, y: 0 }, content, stage).z).toBe(4);
    expect(clampPan({ z: 0.2, x: 0, y: 0 }, content, stage).z).toBe(1);
  });
});

describe('focal zoom', () => {
  it('leaves the point under the fingers where it is', () => {
    const focal = { x: 100, y: -80 };
    const v = zoomAbout({ z: 1, x: 0, y: 0 }, 2, focal, content, stage);
    // The content point under the focal stays put: (focal - offset) / z is unchanged.
    expect((focal.x - v.x) / v.z).toBeCloseTo(100);
    expect((focal.y - v.y) / v.z).toBeCloseTo(-80);
  });
  it('zooming about the center does not move the center', () => {
    expect(zoomAbout({ z: 1, x: 0, y: 0 }, 3, { x: 0, y: 0 }, content, stage)).toEqual({ z: 3, x: 0, y: 0 });
  });
  it('zooming back to 1x recenters', () => {
    expect(zoomAbout({ z: 3, x: 200, y: 100 }, 1, { x: 40, y: 40 }, content, stage)).toEqual({ z: 1, x: 0, y: 0 });
  });
  it('a focal point near the edge is still clamped to the page', () => {
    const v = zoomAbout({ z: 1, x: 0, y: 0 }, 2, { x: 200, y: 280 }, content, stage);
    expect(v.x).toBe(-200);
    expect(v.y).toBe(-280);
  });
});

describe('fitting a region', () => {
  const box = { x: 0, y: 0, w: 400, h: 560 };
  /** Where a page point lands on screen, measured from the stage's top-left. */
  const onScreen = (v: { z: number; x: number; y: number }, px: number, py: number, c = content, s = stage) => ({
    x: s.w / 2 + (px - c.w / 2) * v.z + v.x,
    y: s.h / 2 + (py - c.h / 2) * v.z + v.y,
  });

  it('fits the region to the width, its right edge and top in place', () => {
    const region = { x: 0.5, y: 0.25, w: 0.5, h: 0.25 };
    const v = fitRegion(region, box, content, stage, { margin: 0 });
    expect(v.z).toBe(2);
    expect(onScreen(v, 400, 140).x).toBeCloseTo(400);
    expect(onScreen(v, 400, 140).y).toBeCloseTo(0);
    expect(onScreen(v, 200, 140).x).toBeCloseTo(0);
  });
  it('leaves room under the top bar and at the margin', () => {
    const region = { x: 0.25, y: 0.25, w: 0.5, h: 0.25 };
    const v = fitRegion(region, box, content, stage, { margin: 10, topInset: 56 });
    expect(v.z).toBeCloseTo(1.9);
    expect(onScreen(v, 300, 140).x).toBeCloseTo(390);
    expect(onScreen(v, 300, 140).y).toBeCloseTo(66);
  });
  it('aligns the left edge for left-to-right text', () => {
    const region = { x: 0.25, y: 0.25, w: 0.5, h: 0.25 };
    const v = fitRegion(region, box, content, stage, { margin: 0, rtl: false });
    expect(onScreen(v, 100, 140).x).toBeCloseTo(0);
  });
  it('clamps to the page: a region at the bottom cannot pull the page past its edge', () => {
    const region = { x: 0, y: 0.9, w: 0.5, h: 0.1 };
    const v = fitRegion(region, box, content, stage, { margin: 0 });
    expect(onScreen(v, 400, 560).y).toBeCloseTo(560);
    expect(onScreen(v, 200, 504).y).toBeGreaterThan(0);
  });
  it('a region at the top sits at the page top, not above it', () => {
    const v = fitRegion({ x: 0, y: 0, w: 0.5, h: 0.2 }, box, content, stage, { topInset: 56 });
    expect(onScreen(v, 0, 0).y).toBeCloseTo(0);
  });
  it('stays within 1x to 4x', () => {
    expect(fitRegion({ x: 0, y: 0, w: 1, h: 1 }, box, content, stage).z).toBe(1);
    expect(fitRegion({ x: 0.4, y: 0.4, w: 0.05, h: 0.05 }, box, content, stage).z).toBe(4);
  });
  it('finds a region on either page of a spread', () => {
    const spread = { w: 800, h: 560 };
    const wide = { w: 1000, h: 600 };
    // The right-hand page of an Arabic spread starts at half the content's width.
    const v = fitRegion({ x: 0.5, y: 0, w: 0.5, h: 0.2 }, { x: 400, y: 0, w: 400, h: 560 }, spread, wide, { margin: 0 });
    expect(v.z).toBe(4);
    expect(onScreen(v, 800, 0, spread, wide).x).toBeCloseTo(1000);
  });
});

describe('fitting a region at the stage sizes that once went blank', () => {
  const REGION = { murshid: { x: 0.655, y: 0.07, w: 0.31, h: 0.71 }, council: { x: 0.04, y: 0.07, w: 0.59, h: 0.71 } };
  /** Screen position of a content point; the stage's top-left is 0,0. */
  const at = (v: { z: number; x: number; y: number }, c: { w: number; h: number }, s: { w: number; h: number }, px: number, py: number) => ({
    x: s.w / 2 + (px - c.w / 2) * v.z + v.x,
    y: s.h / 2 + (py - c.h / 2) * v.z + v.y,
  });
  const check = (name: keyof typeof REGION, content: { w: number; h: number }, stage: { w: number; h: number }, box: { x: number; y: number; w: number; h: number }, cap: number, topInset: number) => {
    const r = REGION[name];
    const v = fitRegion(r, box, content, stage, { rtl: true, maxZoom: cap, topInset });
    const corner = at(v, content, stage, box.x + (r.x + r.w) * box.w, box.y + r.y * box.h);
    expect(corner.x, 'top-start corner inside the stage').toBeGreaterThanOrEqual(0);
    expect(corner.x).toBeLessThanOrEqual(stage.w);
    expect(corner.y).toBeGreaterThanOrEqual(0);
    expect(corner.y).toBeLessThan(stage.h);
    expect(v.z).toBeLessThanOrEqual(cap);
    // The content covers the stage per the clamp: no gap on an axis where it is larger than the stage.
    const tl = at(v, content, stage, 0, 0);
    const br = at(v, content, stage, content.w, content.h);
    if (content.w * v.z >= stage.w) {
      expect(tl.x).toBeLessThanOrEqual(0.01);
      expect(br.x).toBeGreaterThanOrEqual(stage.w - 0.01);
    }
    if (content.h * v.z >= stage.h) {
      expect(tl.y).toBeLessThanOrEqual(0.01);
      expect(br.y).toBeGreaterThanOrEqual(stage.h - 0.01);
    }
    return { v, corner };
  };
  // 1440x900 with the rail and the docked list: a 1024x900 stage holding a spread 1024 wide, 724 tall.
  // Page 3 is the left page of the spread [2, 3].
  const spread = { w: 1024, h: 724 };
  const laptop = { w: 1024, h: 900 };
  const leftPage = { x: 0, y: 0, w: 512, h: 724 };
  // A phone: one page 390 wide, 551 tall, in a 390x844 stage.
  const onePage = { w: 390, h: 551 };
  const phone = { w: 390, h: 844 };
  const whole = { x: 0, y: 0, w: 390, h: 551 };

  it('murshid at 1440x900 is on screen at a comfortable zoom, not 4x', () => {
    const { v, corner } = check('murshid', spread, laptop, leftPage, 2, 0);
    expect(v.z).toBe(2);
    expect(corner.x).toBeGreaterThan(900);
  });
  it('council at 1440x900 lands on its page', () => {
    expect(check('council', spread, laptop, leftPage, 2, 0).v.z).toBe(2);
  });
  it('murshid at 390x844 fits the width, capped at 3x', () => {
    const { v, corner } = check('murshid', onePage, phone, whole, 3, 56);
    expect(v.z).toBeCloseTo(3, 1);
    expect(corner.x).toBeGreaterThan(330);
  });
  it('council at 390x844 fits the width', () => {
    const { v, corner } = check('council', onePage, phone, whole, 3, 56);
    expect(v.z).toBeGreaterThan(1.5);
    expect(corner.x).toBeCloseTo(382, 0);
    expect(corner.y).toBeLessThan(100);
  });
});

describe('pinch', () => {
  const m = { x: 40, y: 20 };
  it('scales with the spread of the fingers, about their midpoint', () => {
    const v = pinchView({ z: 1, x: 0, y: 0 }, m, 100, m, 200, content, stage);
    expect(v.z).toBe(2);
    expect((m.x - v.x) / v.z).toBeCloseTo(40);
    expect((m.y - v.y) / v.z).toBeCloseTo(20);
  });
  it('follows the midpoint as it moves', () => {
    const v = pinchView({ z: 2, x: 0, y: 0 }, m, 100, { x: 90, y: 20 }, 100, content, stage);
    expect(v.z).toBe(2);
    expect(v.x).toBe(50);
  });
  it('stops at 4x and at 1x', () => {
    expect(pinchView({ z: 1, x: 0, y: 0 }, m, 10, m, 500, content, stage).z).toBe(4);
    expect(pinchView({ z: 2, x: 0, y: 0 }, m, 500, m, 10, content, stage)).toEqual({ z: 1, x: 0, y: 0 });
  });
});

describe('turn decision', () => {
  const base = { dx: 0, vx: 0, width: 400, forwardSign: 1 as const, canForward: true, canBack: true };
  it('in Arabic a drag to the right goes forward; in English a drag to the left does', () => {
    expect(turnDecision({ ...base, dx: 200 })).toBe(1);
    expect(turnDecision({ ...base, dx: -200 })).toBe(-1);
    expect(turnDecision({ ...base, dx: -200, forwardSign: -1 })).toBe(1);
    expect(turnDecision({ ...base, dx: 200, forwardSign: -1 })).toBe(-1);
  });
  it('a short slow drag settles back', () => {
    expect(turnDecision({ ...base, dx: 60, vx: 0.05 })).toBe(0);
  });
  it('a short flick turns', () => {
    expect(turnDecision({ ...base, dx: 40, vx: 0.8 })).toBe(1);
  });
  it('a flick back against a long drag cancels it', () => {
    expect(turnDecision({ ...base, dx: 200, vx: -0.8 })).toBe(0);
  });
  it('stops at the first and last page', () => {
    expect(turnDecision({ ...base, dx: 300, canForward: false })).toBe(0);
    expect(turnDecision({ ...base, dx: -300, canBack: false })).toBe(0);
  });
  it('no travel is no turn', () => {
    expect(turnDecision({ ...base, dx: 0, vx: 2 })).toBe(0);
  });
});

describe('rubber band', () => {
  it('resists, keeps the direction, and never reaches a third of the width', () => {
    expect(rubberBand(100, 400)).toBeGreaterThan(0);
    expect(rubberBand(100, 400)).toBeLessThan(100);
    expect(rubberBand(-100, 400)).toBeLessThan(0);
    expect(rubberBand(100000, 400)).toBeLessThan(400 / 3);
    expect(rubberBand(0, 400)).toBeCloseTo(0);
  });
  it('grows with the drag', () => {
    expect(rubberBand(200, 400)).toBeGreaterThan(rubberBand(100, 400));
  });
});

describe('taps, marks, sharpness', () => {
  it('two taps close in time and place are a double tap', () => {
    const a = { x: 10, y: 10, t: 0 };
    expect(isDoubleTap(a, { x: 15, y: 12, t: 200 })).toBe(true);
    expect(isDoubleTap(a, { x: 15, y: 12, t: 500 })).toBe(false);
    expect(isDoubleTap(a, { x: 200, y: 12, t: 200 })).toBe(false);
    expect(isDoubleTap(null, a)).toBe(false);
  });
  it('a drag becomes a normalized rectangle, whichever way it went and whatever the zoom', () => {
    const box = { left: 100, top: 50, width: 200, height: 400 };
    expect(rectFromDrag({ x: 150, y: 150 }, { x: 250, y: 250 }, box)).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.25 });
    expect(rectFromDrag({ x: 250, y: 250 }, { x: 150, y: 150 }, box)).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.25 });
    const zoomed = { left: -100, top: -350, width: 800, height: 1600 };
    expect(rectFromDrag({ x: 100, y: 50 }, { x: 500, y: 450 }, zoomed)).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.25 });
  });
  it('a drag past the page stops at its edge; a stray tap marks nothing', () => {
    const box = { left: 0, top: 0, width: 100, height: 100 };
    expect(rectFromDrag({ x: 50, y: 50 }, { x: 500, y: 500 }, box)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(rectFromDrag({ x: 50, y: 50 }, { x: 50.5, y: 50.5 }, box)).toBeNull();
  });
});

describe('limits you can feel', () => {
  it('gives a little past either limit and nothing inside them', () => {
    expect(softZoom(2)).toBe(2);
    expect(softZoom(5)).toBe(4.25);
    expect(softZoom(0.5)).toBe(0.8);
    expect(softZoom(3, 2)).toBe(2.25);
  });
  it('a pinch tracks the fingers past the limit without clamping', () => {
    const m = { x: 40, y: 20 };
    const v = softPinch({ z: 1, x: 0, y: 0 }, m, 10, m, 80);
    expect(v.z).toBe(5);
    expect((m.x - v.x) / v.z).toBeCloseTo(40);
  });
  it('a smaller limit is respected by the clamps', () => {
    expect(clampPan({ z: 3, x: 0, y: 0 }, content, stage, 2).z).toBe(2);
    expect(zoomAbout({ z: 1, x: 0, y: 0 }, 3, { x: 0, y: 0 }, content, stage, 2).z).toBe(2);
    expect(pinchView({ z: 1, x: 0, y: 0 }, { x: 0, y: 0 }, 10, { x: 0, y: 0 }, 80, content, stage, 2).z).toBe(2);
  });
});

describe('wheel and trackpad', () => {
  it('zooms in on a negative delta and out on a positive one, and the two cancel', () => {
    expect(wheelZoomFactor(-10)).toBeGreaterThan(1);
    expect(wheelZoomFactor(10)).toBeLessThan(1);
    expect(wheelZoomFactor(-10) * wheelZoomFactor(10)).toBeCloseTo(1);
  });
  it('caps one huge step', () => {
    expect(wheelZoomFactor(-100000)).toBeCloseTo(Math.E);
  });
  it('a vertical wheel never turns a page', () => {
    expect(wantsTurnFromWheel(0, 0, 500, 1000, 0)).toEqual({ sum: 0, fire: false });
    expect(wantsTurnFromWheel(100, 40, 40, 1000, 0)).toEqual({ sum: 0, fire: false });
  });
  it('a deliberate sideways swipe builds up to one turn, then cools down', () => {
    const a = wantsTurnFromWheel(0, 80, 0, 1000, 0);
    expect(a).toEqual({ sum: 80, fire: false });
    expect(wantsTurnFromWheel(a.sum, 80, 0, 1010, 0).fire).toBe(true);
    expect(wantsTurnFromWheel(0, 500, 0, 1100, 1700).fire).toBe(false);
  });
});

describe('fitting a photo', () => {
  const photo = { w: 718, h: 606 };
  it('keeps the true proportions at every viewport', () => {
    for (const area of [{ w: 390, h: 700 }, { w: 1280, h: 620 }, { w: 1440, h: 800 }, { w: 300, h: 2000 }]) {
      for (const dpr of [1, 2, 3]) {
        const f = photoFit(photo, area, dpr);
        expect(f.w / f.h).toBeCloseTo(718 / 606, 5);
        expect(f.w).toBeLessThanOrEqual(area.w + 0.01);
        expect(f.h).toBeLessThanOrEqual(area.h + 0.01);
      }
    }
  });
  it('a small photo opens small on a big screen rather than blown up', () => {
    const f = photoFit(photo, { w: 1440, h: 1200 }, 1);
    expect(f.w).toBeCloseTo(718 * 1.5);
    expect(f.w).toBeLessThan(1440);
  });
  it('on a phone it fills the width when its pixels allow', () => {
    const f = photoFit(photo, { w: 390, h: 700 }, 2);
    expect(f.w).toBeCloseTo(390);
  });
  it('zooms only as far as two device pixels per source pixel', () => {
    const f = photoFit(photo, { w: 390, h: 700 }, 2);
    expect(f.w * f.maxZoom * 2).toBeCloseTo(718 * 2);
    expect(f.maxZoom).toBeCloseTo(718 / 390);
  });
  it('a larger original raises the limit by itself', () => {
    const small = photoFit(photo, { w: 390, h: 700 }, 2);
    const big = photoFit({ w: 2154, h: 1818 }, { w: 390, h: 700 }, 2);
    expect(big.maxZoom).toBeCloseTo(small.maxZoom * 3);
  });
  it('never goes below fit', () => {
    expect(photoFit({ w: 100, h: 100 }, { w: 1440, h: 800 }, 3).maxZoom).toBeGreaterThanOrEqual(1);
  });
});

import { describe, expect, it } from 'vitest';
import { canvasPlacement, deviceBox, touchesCanvas } from '~/lib/pageCanvas';

const content = { w: 400, h: 560 };
const stage = { w: 400, h: 800 };

describe('mapping a page onto the canvas', () => {
  it('at rest a page sits centered in the stage, at device pixels', () => {
    expect(deviceBox({ x: 0, y: 0, w: 400, h: 560 }, content, stage, { z: 1, x: 0, y: 0 }, 2)).toEqual({ x: 0, y: 240, w: 800, h: 1120 });
  });
  it('one vector unit lands at scale times device-pixel ratio', () => {
    const b = deviceBox({ x: 0, y: 0, w: 400, h: 560 }, content, stage, { z: 3, x: 0, y: 0 }, 2);
    expect(b.w).toBe(400 * 3 * 2);
    expect(b.h).toBe(560 * 3 * 2);
  });
  it('follows the pan and zooms about the center', () => {
    const b = deviceBox({ x: 0, y: 0, w: 400, h: 560 }, content, stage, { z: 2, x: 50, y: -30 }, 1);
    expect(b.x).toBe(200 + (0 - 200) * 2 + 50);
    expect(b.y).toBe(400 + (0 - 280) * 2 - 30);
  });
  it('the top-left is always on a whole device pixel', () => {
    const b = deviceBox({ x: 13, y: 7, w: 100, h: 100 }, content, stage, { z: 1.37, x: 3.3, y: 1.1 }, 1.5);
    expect(Number.isInteger(b.x)).toBe(true);
    expect(Number.isInteger(b.y)).toBe(true);
  });
  it('places the second page of a spread by its own box', () => {
    const spread = { w: 800, h: 560 };
    const wide = { w: 800, h: 560 };
    expect(deviceBox({ x: 400, y: 0, w: 400, h: 560 }, spread, wide, { z: 1, x: 0, y: 0 }, 2).x).toBe(800);
  });
});

describe('placing the canvas in the zooming sheet', () => {
  // A point in the canvas at stage position s lands, through the placement and the sheet's transform, back at s.
  const roundTrip = (view: { z: number; x: number; y: number }, sx: number, sy: number) => {
    const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(canvasPlacement(content, stage, view))!;
    const lx = Number(m[1]) + sx * Number(m[3]);
    const ly = Number(m[2]) + sy * Number(m[3]);
    return { x: stage.w / 2 + (lx - content.w / 2) * view.z + view.x, y: stage.h / 2 + (ly - content.h / 2) * view.z + view.y };
  };
  it('covers the stage exactly at any zoom and pan', () => {
    for (const view of [{ z: 1, x: 0, y: 0 }, { z: 2, x: 120, y: -80 }, { z: 3.7, x: -300, y: 500 }]) {
      for (const [sx, sy] of [[0, 0], [400, 800], [123, 456]]) {
        const p = roundTrip(view, sx, sy);
        expect(p.x).toBeCloseTo(sx, 6);
        expect(p.y).toBeCloseTo(sy, 6);
      }
    }
  });
});

describe('what needs drawing', () => {
  it('skips a page entirely off the canvas', () => {
    expect(touchesCanvas({ x: 0, y: 0, w: 10, h: 10 }, 100, 100)).toBe(true);
    expect(touchesCanvas({ x: 100, y: 0, w: 10, h: 10 }, 100, 100)).toBe(false);
    expect(touchesCanvas({ x: -10, y: 0, w: 10, h: 10 }, 100, 100)).toBe(false);
    expect(touchesCanvas({ x: -10, y: -10, w: 500, h: 500 }, 100, 100)).toBe(true);
  });
});

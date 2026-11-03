import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boundsOf, cropStyle, mergeLines, nearestWord, padRect, parseLayout, photoSource, placeInPage, snapMark, type PageLayout } from '~/lib/pageLayout';

const word = (x: number, y: number, w = 0.08, h = 0.02) => ({ x, y, w, h });
// Two right-to-left lines in the right column, then one line in the left column, in reading order.
const words = [word(0.8, 0.1), word(0.7, 0.1), word(0.6, 0.1), word(0.8, 0.13), word(0.7, 0.13), word(0.3, 0.1), word(0.2, 0.1)];
const layout: PageLayout = { images: [], words };

describe('parsing a layout file', () => {
  it('reads rectangles', () => {
    expect(parseLayout({ v: 1, images: [[0.1, 0.2, 0.3, 0.4]], words: [] })).toEqual({ images: [{ rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }], words: [] });
    expect(parseLayout({ v: 2, images: [{ r: [0.1, 0.2, 0.3, 0.4], file: 'photos/p2-1.jpg', w: 718, h: 606, rot: 1 }], words: [] })?.images[0]).toEqual({ rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, file: 'photos/p2-1.jpg', px: { w: 718, h: 606 }, rot: 1 });
  });
  it('rejects what is not a layout and drops what is malformed inside one', () => {
    expect(parseLayout(null)).toBeNull();
    expect(parseLayout('<html>')).toBeNull();
    expect(parseLayout({ images: [] })).toBeNull();
    expect(parseLayout({ images: [[1, 2], 'x', [0, 0, 0, 1]], words: [] })).toEqual({ images: [], words: [] });
    expect(parseLayout({ images: [{ r: [0, 0, 1, 1], file: '../../secret.jpg', w: 9, h: 9 }], words: [] })?.images[0]).toEqual({ rect: { x: 0, y: 0, w: 1, h: 1 } });
  });
});

describe('finding a word', () => {
  it('finds the word under a point, or the nearest within reach', () => {
    expect(nearestWord(words, { x: 0.82, y: 0.11 })).toBe(0);
    expect(nearestWord(words, { x: 0.785, y: 0.11 })).toBe(1);
    expect(nearestWord(words, { x: 0.5, y: 0.6 })).toBe(-1);
    expect(nearestWord(words, { x: 0.5, y: 0.6 }, Infinity)).toBeGreaterThanOrEqual(0);
  });
});

describe('merging into lines', () => {
  it('joins neighbors on one line, whichever way the text runs', () => {
    const r = mergeLines([word(0.8, 0.1), word(0.7, 0.1), word(0.6, 0.1)]);
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeCloseTo(0.6);
    expect(r[0].w).toBeCloseTo(0.28);
  });
  it('starts a new rectangle on a new line', () => {
    expect(mergeLines([word(0.8, 0.1), word(0.8, 0.13)])).toHaveLength(2);
  });
  it('keeps columns apart even at the same height', () => {
    expect(mergeLines([word(0.8, 0.1), word(0.2, 0.1)])).toHaveLength(2);
  });
});

describe('snapping a drag', () => {
  it('selects the words between the ends, in reading order, line by line', () => {
    const r = snapMark(layout, { x: 0.72, y: 0.11 }, { x: 0.72, y: 0.14 })!;
    // From the second word of the first line to the second word of the next line.
    expect(r).toHaveLength(2);
    expect(r[0].x).toBeCloseTo(0.6);
    expect(r[1].x).toBeCloseTo(0.7);
    expect(r[1].y).toBeCloseTo(0.13);
  });
  it('gives the same run dragged backwards', () => {
    const a = { x: 0.72, y: 0.11 };
    const b = { x: 0.72, y: 0.14 };
    expect(snapMark(layout, b, a)).toEqual(snapMark(layout, a, b));
  });
  it('off the text it is a free rectangle', () => {
    expect(snapMark(layout, { x: 0.1, y: 0.5 }, { x: 0.3, y: 0.6 })).toEqual([{ x: 0.1, y: 0.5, w: expect.closeTo(0.2), h: expect.closeTo(0.1) }]);
  });
  it('without layout data it is a free rectangle', () => {
    expect(snapMark(null, { x: 0.72, y: 0.11 }, { x: 0.9, y: 0.3 })).toHaveLength(1);
    expect(snapMark({ images: [], words: [] }, { x: 0.72, y: 0.11 }, { x: 0.9, y: 0.3 })).toHaveLength(1);
  });
  it('a stray tap marks nothing', () => {
    expect(snapMark(layout, { x: 0.72, y: 0.11 }, { x: 0.721, y: 0.111 })).toBeNull();
    expect(snapMark(null, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.52 })).toBeNull();
  });
});

describe('a photo\'s source', () => {
  const rect = { x: 0, y: 0, w: 0.5, h: 0.25 };
  it('uses the original, turned as placed', () => {
    expect(photoSource({ rect, px: { w: 1494, h: 1122 } })).toEqual({ w: 1494, h: 1122 });
    expect(photoSource({ rect, px: { w: 1494, h: 1122 }, rot: 1 })).toEqual({ w: 1122, h: 1494 });
  });
  it('prefers what the browser found over what the file said, so a larger original counts', () => {
    expect(photoSource({ rect, px: { w: 718, h: 606 } }, { w: 2154, h: 1818 })).toEqual({ w: 2154, h: 1818 });
  });
  it('without an original, falls back to the page at print resolution', () => {
    expect(photoSource({ rect })).toEqual({ w: 1240, h: 877 });
  });
});

describe('a real layout file', () => {
  it('page 2 of issue 21 parses to its six photos, each with an original', () => {
    const file = readFileSync(new URL('../../public/archive/21/l02.json', import.meta.url), 'utf8');
    const layout = parseLayout(JSON.parse(file))!;
    expect(layout.images).toHaveLength(6);
    for (const im of layout.images) expect(im.file).toMatch(/^photos\/p2-\d\.jpg$/);
    expect(layout.words.length).toBeGreaterThan(100);
  });
});

describe('placing and cropping', () => {
  it('bounds and pads, staying on the page', () => {
    expect(boundsOf([word(0.2, 0.1, 0.1, 0.1), word(0.5, 0.3, 0.1, 0.1)])).toEqual({ x: 0.2, y: 0.1, w: expect.closeTo(0.4), h: expect.closeTo(0.3) });
    expect(padRect({ x: 0, y: 0.99, w: 0.5, h: 0.01 }, 0.02)).toEqual({ x: 0, y: expect.closeTo(0.97), w: expect.closeTo(0.52), h: expect.closeTo(0.03) });
  });
  it('crops to exactly the rectangle', () => {
    const s = cropStyle('/p.jpg', { x: 0.25, y: 0, w: 0.5, h: 0.25 });
    expect(s.backgroundSize).toBe('200% 400%');
    expect(s.backgroundPosition).toBe('50% 0%');
    expect(s.backgroundImage).toContain('/p.jpg');
    expect(cropStyle('/p.jpg', { x: 0, y: 0, w: 1, h: 1 }).backgroundPosition).toBe('0% 0%');
  });
  it('places from the right edge of the always right-to-left page box', () => {
    expect(placeInPage({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toEqual({ insetInlineStart: '60%', insetBlockStart: '20%', inlineSize: '30%', blockSize: '40%' });
  });
});

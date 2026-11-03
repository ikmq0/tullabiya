// Where things sit on a printed page, from scripts/extract_layout.py, and how a mark snaps to it.
// Positions only: the PDFs' extracted text is damaged and is never kept or shown.
import type { Point, Rect } from './gesture';

/** A photo placed on the page. `file` is its original, when one stands behind this area. */
export interface PagePhoto {
  rect: Rect;
  file?: string;
  /** The original's pixel size, as stored: before any quarter turns. */
  px?: { w: number; h: number };
  /** Clockwise quarter turns as placed on the page. */
  rot?: number;
}

export interface PageLayout {
  images: PagePhoto[];
  words: Rect[];
}

const toRect = (v: unknown): Rect | null => {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [x, y, w, h] = v as number[];
  return w > 0 && h > 0 ? { x, y, w, h } : null;
};

const SAFE_FILE = /^photos\/[\w.-]+\.(jpg|jpeg|png)$/;

function toPhoto(v: unknown): PagePhoto | null {
  if (Array.isArray(v)) {
    const rect = toRect(v);
    return rect && { rect };
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as { r?: unknown; file?: unknown; w?: unknown; h?: unknown; rot?: unknown };
  const rect = toRect(o.r);
  if (!rect) return null;
  const photo: PagePhoto = { rect };
  if (typeof o.file === 'string' && SAFE_FILE.test(o.file) && typeof o.w === 'number' && typeof o.h === 'number' && o.w > 0 && o.h > 0) {
    photo.file = o.file;
    photo.px = { w: o.w, h: o.h };
    if (o.rot === 1 || o.rot === 2 || o.rot === 3) photo.rot = o.rot;
  }
  return photo;
}

/** A layout file's contents, or null when it is not one. Anything malformed inside it is dropped. */
export function parseLayout(json: unknown): PageLayout | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as { images?: unknown; words?: unknown };
  if (!Array.isArray(o.images) || !Array.isArray(o.words)) return null;
  return { images: o.images.map(toPhoto).filter((r): r is PagePhoto => r !== null), words: o.words.map(toRect).filter((r): r is Rect => r !== null) };
}

/** A photo's shape on the page, in pixels of its best source. Without an original, the page at print
 *  resolution (300 dpi of A4) is what there is. */
export function photoSource(photo: PagePhoto, natural?: { w: number; h: number }): { w: number; h: number } {
  const px = natural ?? photo.px;
  if (px) return photo.rot === 1 || photo.rot === 3 ? { w: px.h, h: px.w } : { w: px.w, h: px.h };
  return { w: photo.rect.w * 2480, h: photo.rect.h * 3508 };
}

const distance = (r: Rect, p: Point) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));

/** The index of the word under or nearest a point, within `tolerance` (of the page), or -1. */
export function nearestWord(words: readonly Rect[], p: Point, tolerance = 0.012): number {
  let best = -1;
  let bestD = tolerance;
  words.forEach((w, i) => {
    const d = distance(w, p);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Joins a run of words into one rectangle per line. Words join when they share most of their height and sit
 *  close together, which keeps neighboring columns apart whichever way the text runs. */
export function mergeLines(words: readonly Rect[]): Rect[] {
  const out: Rect[] = [];
  for (const w of words) {
    const last = out[out.length - 1];
    if (last) {
      const overlap = Math.min(last.y + last.h, w.y + w.h) - Math.max(last.y, w.y);
      const gap = Math.max(last.x, w.x) - Math.min(last.x + last.w, w.x + w.w);
      const height = Math.min(last.h, w.h);
      if (overlap >= height * 0.5 && gap <= height * 2.5) {
        const x = Math.min(last.x, w.x);
        const y = Math.min(last.y, w.y);
        out[out.length - 1] = { x, y, w: Math.max(last.x + last.w, w.x + w.w) - x, h: Math.max(last.y + last.h, w.y + w.h) - y };
        continue;
      }
    }
    out.push({ ...w });
  }
  return out;
}

const MIN_DRAG = 0.008;

/** What a drag from `a` to `b` marks. Starting on text it selects the words between them in reading order,
 *  line by line. Off text, or without layout data, it is a free rectangle. A stray tap marks nothing. */
export function snapMark(layout: PageLayout | null, a: Point, b: Point): Rect[] | null {
  if (Math.hypot(a.x - b.x, a.y - b.y) < MIN_DRAG) return null;
  if (layout && layout.words.length > 0) {
    const from = nearestWord(layout.words, a);
    if (from >= 0) {
      const to = nearestWord(layout.words, b, Infinity);
      return mergeLines(layout.words.slice(Math.min(from, to), Math.max(from, to) + 1));
    }
  }
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return w < 0.02 || h < 0.01 ? null : [{ x, y, w, h }];
}

/** The smallest rectangle around a set of rectangles. */
export function boundsOf(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
}

/** Pads a rectangle, staying on the page. */
export function padRect(r: Rect, pad: number): Rect {
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  return { x, y, w: Math.min(1, r.x + r.w + pad) - x, h: Math.min(1, r.y + r.h + pad) - y };
}

/** Printed pages are A4 portrait: 595 by 842 points. */
export const PAGE_ASPECT = 595 / 842;

/** Styles that show only `r` of a page image, scaled to fill its box. */
export function cropStyle(src: string, r: Rect): Record<string, string> {
  const pos = (at: number, size: number) => (size >= 1 ? 0 : (at / (1 - size)) * 100);
  return {
    backgroundImage: `url("${src}")`,
    backgroundSize: `${100 / r.w}% ${100 / r.h}%`,
    backgroundPosition: `${pos(r.x, r.w)}% ${pos(r.y, r.h)}%`,
    backgroundRepeat: 'no-repeat',
  };
}

const pct = (v: number) => `${Number((v * 100).toFixed(3))}%`;

/** Where a rectangle goes inside a right-to-left page box, in logical properties. */
export function placeInPage(r: Rect): Record<string, string> {
  return {
    insetInlineStart: pct(1 - r.x - r.w),
    insetBlockStart: pct(r.y),
    inlineSize: pct(r.w),
    blockSize: pct(r.h),
  };
}

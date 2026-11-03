// The math behind moving and zooming a page or photo. Pure: `stage.ts` applies it to the DOM.
// Offsets are in CSS pixels; focal points are measured from the center of the stage.

export interface View {
  z: number;
  x: number;
  y: number;
}
export interface Size {
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}
/** A rectangle in normalized page coordinates: 0 to 1 from the page's top-left corner. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const TAP_ZOOM = 2.5;

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Keeps the zoomed content covering the stage: no pan past its edges, none at all at 1x. */
export function clampPan(v: View, content: Size, stage: Size, maxZoom = MAX_ZOOM): View {
  const z = clamp(v.z, MIN_ZOOM, maxZoom);
  if (z <= MIN_ZOOM) return { z: MIN_ZOOM, x: 0, y: 0 };
  const mx = Math.max(0, (content.w * z - stage.w) / 2);
  const my = Math.max(0, (content.h * z - stage.h) / 2);
  return { z, x: clamp(v.x, -mx, mx), y: clamp(v.y, -my, my) };
}

/** A new zoom that leaves the point under `focal` where it is. */
export function zoomAbout(v: View, nextZ: number, focal: Point, content: Size, stage: Size, maxZoom = MAX_ZOOM): View {
  const z = clamp(nextZ, MIN_ZOOM, maxZoom);
  const k = z / v.z;
  return clampPan({ z, x: focal.x - (focal.x - v.x) * k, y: focal.y - (focal.y - v.y) * k }, content, stage, maxZoom);
}

/** The view that fits a region of a page to the stage's width, with its top under `topInset` and, in
 *  right-to-left text, its right edge against the stage's right edge. `pageBox` places the page inside the
 *  content (a spread holds two), in unzoomed pixels from the content's top-left. Clamped to the content. */
export function fitRegion(
  region: Rect,
  pageBox: { x: number; y: number; w: number; h: number },
  content: Size,
  stage: Size,
  opts: { topInset?: number; margin?: number; rtl?: boolean; maxZoom?: number } = {},
): View {
  const { topInset = 0, margin = 8, rtl = true, maxZoom = MAX_ZOOM } = opts;
  const z = clamp((stage.w - margin * 2) / (region.w * pageBox.w), MIN_ZOOM, maxZoom);
  const left = pageBox.x + region.x * pageBox.w;
  const top = pageBox.y + region.y * pageBox.h;
  const edge = rtl ? left + region.w * pageBox.w : left;
  const x = rtl ? stage.w / 2 - margin - (edge - content.w / 2) * z : -stage.w / 2 + margin - (edge - content.w / 2) * z;
  const y = -stage.h / 2 + topInset + margin - (top - content.h / 2) * z;
  return clampPan({ z, x, y }, content, stage);
}

/** Two fingers: scales by how far they spread, follows their midpoint as it moves. Hard limits, for a settled view. */
export function pinchView(start: View, m0: Point, d0: number, m1: Point, d1: number, content: Size, stage: Size, maxZoom = MAX_ZOOM): View {
  const z = clamp((start.z * d1) / Math.max(1, d0), MIN_ZOOM, maxZoom);
  const k = z / start.z;
  return clampPan({ z, x: m1.x - (m0.x - start.x) * k, y: m1.y - (m0.y - start.y) * k }, content, stage, maxZoom);
}

/** A zoom past its limits gives a little, so the limit is felt rather than hit. */
export function softZoom(z: number, maxZoom = MAX_ZOOM): number {
  if (z > maxZoom) return maxZoom + (z - maxZoom) * 0.25;
  if (z < MIN_ZOOM) return MIN_ZOOM - (MIN_ZOOM - z) * 0.4;
  return z;
}

/** The pinch while the fingers are down: follows them 1:1 and gives softly at the limits. The view is clamped
 *  when they lift, so it bounces back. */
export function softPinch(start: View, m0: Point, d0: number, m1: Point, d1: number, maxZoom = MAX_ZOOM): View {
  const z = softZoom((start.z * d1) / Math.max(1, d0), maxZoom);
  const k = z / start.z;
  return { z, x: m1.x - (m0.x - start.x) * k, y: m1.y - (m0.y - start.y) * k };
}

/** How much a wheel or trackpad pinch step zooms. Small steps from a trackpad, larger from a mouse wheel;
 *  equal steps in and out cancel exactly. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-clamp(deltaY, -100, 100) * 0.01);
}

/** A sideways wheel turns a page only when it is clearly sideways, built up over a stretch, and not right after
 *  the last turn. A plain vertical wheel never does. */
export function wantsTurnFromWheel(sum: number, dx: number, dy: number, now: number, coolUntil: number): { sum: number; fire: boolean } {
  if (now < coolUntil || Math.abs(dx) <= Math.abs(dy) * 1.5) return { sum: 0, fire: false };
  const next = sum + dx;
  return Math.abs(next) >= 140 ? { sum: 0, fire: true } : { sum: next, fire: false };
}

/** The most device pixels per source pixel a photo opens at, and the most it zooms to. */
export const PHOTO_FIT_DENSITY = 1.5;
export const PHOTO_MAX_DENSITY = 2;

/** A photo's size at fit: contained in the area at its true proportions, never enlarged past what its pixels
 *  support on this screen, and how far it may zoom before it goes past them. */
export function photoFit(source: Size, area: Size, dpr: number): { w: number; h: number; maxZoom: number } {
  const contain = Math.min(area.w / source.w, area.h / source.h);
  const crisp = PHOTO_FIT_DENSITY / Math.max(0.5, dpr);
  const scale = Math.min(contain, crisp);
  const w = source.w * scale;
  const h = source.h * scale;
  const most = (PHOTO_MAX_DENSITY * source.w) / Math.max(0.5, dpr) / w;
  return { w, h, maxZoom: Math.max(1, most) };
}

/** Resistance past the first and last page: tracks at first, then tapers towards a third of the width. */
export function rubberBand(dx: number, width: number): number {
  if (width <= 0) return 0;
  const limit = width / 3;
  const d = Math.abs(dx);
  return Math.sign(dx) * limit * (1 - 1 / (d / width + 1));
}

export interface TurnInput {
  /** Finger travel, positive to the right. */
  dx: number;
  /** Finger speed in px/ms, positive to the right. */
  vx: number;
  width: number;
  /** +1 when a drag to the right moves forward (Arabic), -1 when a drag to the left does (English). */
  forwardSign: 1 | -1;
  canForward: boolean;
  canBack: boolean;
}

/** After a drag: turn forward (1), back (-1) or settle where it was (0). A flick counts even when short,
 *  and a flick against the drag cancels it. */
export function turnDecision({ dx, vx, width, forwardSign, canForward, canBack }: TurnInput): 1 | -1 | 0 {
  const FLICK = 0.35;
  const FAR = 0.25;
  if (dx === 0) return 0;
  const sign = dx > 0 ? 1 : -1;
  const against = vx * sign < -FLICK;
  if (against) return 0;
  const far = Math.abs(dx) >= width * FAR;
  const flick = vx * sign >= FLICK && Math.abs(dx) >= 12;
  if (!far && !flick) return 0;
  const dir = sign === forwardSign ? 1 : -1;
  if (dir === 1 && !canForward) return 0;
  if (dir === -1 && !canBack) return 0;
  return dir;
}

export const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 32;

export function isDoubleTap(a: { x: number; y: number; t: number } | null, b: { x: number; y: number; t: number }): boolean {
  return !!a && b.t - a.t <= DOUBLE_TAP_MS && Math.hypot(a.x - b.x, a.y - b.y) <= DOUBLE_TAP_PX;
}

/** The rectangle between two points inside a page box given as its top-left and on-screen size, whatever
 *  the zoom, or null for a stray tap too small to mean anything. */
export function rectFromDrag(a: Point, b: Point, box: { left: number; top: number; width: number; height: number }): Rect | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const nx = (v: number) => clamp((v - box.left) / box.width, 0, 1);
  const ny = (v: number) => clamp((v - box.top) / box.height, 0, 1);
  const x = Math.min(nx(a.x), nx(b.x));
  const y = Math.min(ny(a.y), ny(b.y));
  const w = Math.abs(nx(a.x) - nx(b.x));
  const h = Math.abs(ny(a.y) - ny(b.y));
  return w < 0.02 || h < 0.01 ? null : { x, y, w, h };
}

// The settled view of the printed page, painted on the CPU at exact device pixels. A huge GPU-rastered layer of
// thousands of glyph paths comes out jagged on some graphics hardware; this gives the same clean text everywhere,
// at a cost bounded by the screen rather than the zoom.
import type { Rect, Size, View } from './gesture';

export interface PaintPhoto {
  src: string;
  rect: Rect;
  /** Clockwise quarter turns as placed on the page. */
  rot: number;
}

/** Past this zoom the page's own resampled photos are visibly soft next to the text, so the originals go on top. */
export const ORIGINALS_FROM = 1.3;

/** Where a box in the content lands on the canvas, in device pixels. The top-left is pixel-aligned so one vector
 *  unit always lands the same way. */
export function deviceBox(box: { x: number; y: number; w: number; h: number }, content: Size, stage: Size, view: View, dpr: number): { x: number; y: number; w: number; h: number } {
  const left = stage.w / 2 + (box.x - content.w / 2) * view.z + view.x;
  const top = stage.h / 2 + (box.y - content.h / 2) * view.z + view.y;
  return { x: Math.round(left * dpr), y: Math.round(top * dpr), w: box.w * view.z * dpr, h: box.h * view.z * dpr };
}

/** The transform that places a canvas, drawn in stage space, inside the content so that under the content's own
 *  transform it lands exactly over the stage. */
export function canvasPlacement(content: Size, stage: Size, view: View): string {
  const x = (-stage.w / 2 - view.x) / view.z + content.w / 2;
  const y = (-stage.h / 2 - view.y) / view.z + content.h / 2;
  return `translate(${x}px, ${y}px) scale(${1 / view.z})`;
}

/** Whether a box in device pixels touches a canvas of this size. */
export function touchesCanvas(b: { x: number; y: number; w: number; h: number }, w: number, h: number): boolean {
  return b.x < w && b.y < h && b.x + b.w > 0 && b.y + b.h > 0;
}

interface PaintInput {
  stage: HTMLElement;
  sheet: HTMLElement;
  view: View;
  dpr: number;
  photosOf: (page: number) => PaintPhoto[];
  /** Returns the decoded original, or null while it is still on its way. */
  original: (src: string) => HTMLImageElement | null;
}

/** Paints what the stage shows. False when the browser cannot do it: the images underneath simply stay. */
export function paintPages({ stage, sheet, view, dpr, photosOf, original }: PaintInput): boolean {
  const stageSize = { w: stage.clientWidth, h: stage.clientHeight };
  const content = { w: sheet.offsetWidth, h: sheet.offsetHeight };
  if (!stageSize.w || !stageSize.h || !content.w) return true;
  const pages = Array.from(sheet.querySelectorAll<HTMLElement>('[data-page-box]'));
  const images = pages.map((p) => p.querySelector<HTMLImageElement>('img[data-page]'));
  // Not ready yet: the page's load event asks again.
  if (images.some((im) => !im || !im.complete || !im.naturalWidth)) return true;

  let canvas = sheet.querySelector<HTMLCanvasElement>(':scope > .page-canvas');
  const fresh = !canvas;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'page-canvas';
    canvas.setAttribute('aria-hidden', 'true');
  }
  const w = Math.round(stageSize.w * dpr);
  const h = Math.round(stageSize.h * dpr);
  // Painted aside and copied in one step, so the visible canvas is never seen half drawn.
  const scratch = document.createElement('canvas');
  scratch.width = w;
  scratch.height = h;
  const ctx = scratch.getContext('2d', { willReadFrequently: true, alpha: true });
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  try {
    pages.forEach((page, i) => {
      const box = deviceBox({ x: page.offsetLeft, y: page.offsetTop, w: page.offsetWidth, h: page.offsetHeight }, content, stageSize, view, dpr);
      if (!touchesCanvas(box, w, h)) return;
      ctx.fillStyle = '#fff';
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.drawImage(images[i]!, box.x, box.y, box.w, box.h);
      if (view.z <= ORIGINALS_FROM) return;
      for (const ph of photosOf(Number(page.dataset.pageBox))) {
        const px = { x: box.x + ph.rect.x * box.w, y: box.y + ph.rect.y * box.h, w: ph.rect.w * box.w, h: ph.rect.h * box.h };
        if (!touchesCanvas(px, w, h)) continue;
        const im = original(ph.src);
        if (!im) continue;
        if (ph.rot % 2 === 0 && ph.rot === 0) {
          ctx.drawImage(im, px.x, px.y, px.w, px.h);
        } else {
          ctx.save();
          ctx.translate(px.x + px.w / 2, px.y + px.h / 2);
          ctx.rotate((ph.rot * Math.PI) / 2);
          const turned = ph.rot % 2 === 1;
          const dw = turned ? px.h : px.w;
          const dh = turned ? px.w : px.h;
          ctx.drawImage(im, -dw / 2, -dh / 2, dw, dh);
          ctx.restore();
        }
      }
    });
  } catch {
    return false;
  }
  canvas.width = w;
  canvas.height = h;
  const out = canvas.getContext('2d', { willReadFrequently: true });
  if (!out) return false;
  out.drawImage(scratch, 0, 0);
  canvas.style.inlineSize = `${stageSize.w}px`;
  canvas.style.blockSize = `${stageSize.h}px`;
  canvas.style.transform = canvasPlacement(content, stageSize, view);
  if (fresh) sheet.append(canvas);
  return true;
}

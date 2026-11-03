// A 1080x1350 share card drawn on canvas: the brand's slanted bars, KFUPM Display,
// the quote or the cover, and the reader's name and photo when they have a profile.
import type { Lang, Profile } from '~/lib/model';
import { accent } from '~/lib/model';
import { displayName, initial } from '~/lib/name';

export interface ShareCardOptions {
  kind: 'quote' | 'cover';
  quote?: string;
  source: string;
  issueLine: string;
  lang: Lang;
  profile?: Profile | null;
  forLine?: string;
  coverUrl?: string;
  coverLine?: string;
}

export interface ShareCardResult {
  blob: Blob;
  meta: { width: 1080; height: 1350; personalized: boolean };
}

const W = 1080;
const H = 1350;
const C = { turq: '#115F66', green: '#009767', beige: '#ECE0C7', yellow: '#F0BA4F', ink: '#0B3A3F', sand: '#A48A70' };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function bars(ctx: CanvasRenderingContext2D, y: number, color: string, heights: number[]) {
  ctx.save();
  ctx.fillStyle = color;
  const gap = 10;
  const w = (W - 160 - gap * (heights.length - 1)) / heights.length;
  heights.forEach((h, i) => {
    const x = 80 + i * (w + gap);
    ctx.save();
    ctx.transform(1, 0, -0.09, 1, 0, 0);
    ctx.fillRect(x + y * 0.09, y - h, w, h);
    ctx.restore();
  });
  ctx.restore();
}

export async function renderShareCard(opts: ShareCardOptions): Promise<ShareCardResult> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no-canvas');
  const rtl = opts.lang === 'ar';
  try {
    await Promise.all([document.fonts.load('900 64px "KFUPM Display"'), document.fonts.load('700 40px "KFUPM Display"'), document.fonts.load('500 30px "IBM Plex Sans Arabic"')]);
  } catch {}
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  const x0 = rtl ? W - 80 : 80;

  if (opts.kind === 'cover' && opts.coverUrl) {
    ctx.fillStyle = C.turq;
    ctx.fillRect(0, 0, W, H);
    try {
      const img = await loadImage(opts.coverUrl);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W, 0);
      ctx.lineTo(W, 760);
      ctx.lineTo(0, 860);
      ctx.closePath();
      ctx.clip();
      const scale = Math.max(W / img.width, 860 / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (W - dw) / 2, (860 - dh) / 2, dw, dh);
      ctx.restore();
    } catch {}
    if (opts.coverLine) {
      ctx.fillStyle = C.yellow;
      ctx.font = '900 60px "KFUPM Display"';
      const tw = ctx.measureText(opts.coverLine).width + 80;
      const lx = rtl ? W - 80 - tw : 80;
      ctx.beginPath();
      ctx.moveTo(lx + 20, 700);
      ctx.lineTo(lx + tw, 700);
      ctx.lineTo(lx + tw - 20, 790);
      ctx.lineTo(lx, 790);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.fillText(opts.coverLine, rtl ? W - 110 : 110, 766);
    }
    ctx.fillStyle = C.beige;
    ctx.font = '700 44px "KFUPM Display"';
    ctx.fillText(opts.source, x0, 960);
  } else {
    ctx.fillStyle = C.beige;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.turq;
    ctx.fillRect(0, 0, W, 180);
    ctx.fillStyle = C.beige;
    ctx.font = '900 64px "KFUPM Display"';
    ctx.fillText('الطلّابية', x0, 118);
    ctx.fillStyle = C.ink;
    ctx.font = '900 62px "KFUPM Display"';
    const lines = wrap(ctx, `«${opts.quote ?? ''}»`, W - 160).slice(0, 9);
    let y = 330;
    for (const l of lines) {
      ctx.fillText(l, x0, y);
      y += 86;
    }
    ctx.fillStyle = C.turq;
    ctx.font = '700 40px "KFUPM Display"';
    ctx.fillText(opts.source, x0, Math.min(y + 40, 1080));
  }

  // issue line and the reader
  const personalized = !!opts.profile;
  ctx.fillStyle = opts.kind === 'cover' ? C.beige : C.ink;
  ctx.font = '500 32px "IBM Plex Sans Arabic"';
  ctx.fillText(opts.issueLine, x0, 1160);
  if (opts.profile) {
    const p = opts.profile;
    const c = accent(p.color);
    const cx = rtl ? 130 : W - 130;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, 1150, 56, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(c.color.replace(/var\(|\)/g, '')).trim() || C.sand;
    ctx.fill();
    ctx.clip();
    if (p.avatar) {
      try {
        const img = await loadImage(p.avatar);
        ctx.drawImage(img, cx - 56, 1094, 112, 112);
      } catch {}
    } else {
      ctx.fillStyle = c.ink === 'ink' ? C.ink : C.beige;
      ctx.font = '900 56px "KFUPM Display"';
      ctx.textAlign = 'center';
      ctx.fillText(initial(p.name), cx, 1170);
    }
    ctx.restore();
    ctx.textAlign = rtl ? 'right' : 'left';
    ctx.fillStyle = opts.kind === 'cover' ? C.beige : C.ink;
    ctx.font = '700 34px "KFUPM Display"';
    ctx.fillText(opts.forLine ?? displayName(p.name), x0, 1215);
  }
  bars(ctx, H - 40, opts.kind === 'cover' ? C.beige : C.green, [60, 90, 40, 110, 70, 50, 120, 80, 45, 95, 65, 100]);

  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no-blob'))), 'image/png'));
  return { blob, meta: { width: W, height: H, personalized } };
}

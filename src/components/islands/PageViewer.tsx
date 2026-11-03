import type { ComponentChildren, RefObject } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '~/i18n';
import { clamp, fitRegion, type Point, type Rect } from '~/lib/gesture';
import type { Lang } from '~/lib/model';
import { placeInPage } from '~/lib/pageLayout';
import { neighborPages, stepPage, visiblePages } from '~/lib/reader';
import { createStage, type Stage } from '~/lib/stage';

export interface ViewerHandle {
  step(dir: 1 | -1): void;
  jump(page: number): void;
  zoomBy(delta: number): void;
  resetZoom(): void;
  /** Goes to a page and, given a region of it, moves smoothly to fit that region to the stage. */
  focus(page: number, region: Rect | null, topInset: number): void;
}

interface Props {
  lang: Lang;
  issue: number;
  pages: number;
  base: string;
  /** The open page when the parent owns it; without it the viewer keeps its own, starting at 1. */
  page?: number;
  onPage?: (page: number) => void;
  /** Inside the reader app: the stage only, zoom, sharper pages when zoomed. The app draws the controls. */
  reader?: boolean;
  /** Facing pages. */
  wide?: boolean;
  handle?: RefObject<ViewerHandle | null>;
  /** Going forward from the last page leads here. */
  endHref?: string;
  onZoom?: (z: number) => void;
  onTap?: (target: Element) => void;
  /** Rendered over a page, inside it, so it stays aligned at every zoom. */
  overlay?: (page: number) => ComponentChildren;
  /** Marking mode: a drag marks instead of moving the page. */
  marking?: boolean;
  /** Turns a drag on a page (normalized points) into what it would mark, or null. */
  snap?: (page: number, a: Point, b: Point) => Rect[] | null;
  onMarkDrawn?: (page: number, rects: Rect[]) => void;
}

const name = (p: number) => String(p).padStart(2, '0');
const lowRes = (base: string, p: number) => `${base}p${name(p)}.jpg`;
const vector = (base: string, p: number) => `${base}v${name(p)}.svg`;

/** How much of the zoom is already in the sheet's layout: its width against its base, from the inline style. */
function layoutZOf(sheet: HTMLElement, z: number): number {
  const m = sheet.style.transform ? new DOMMatrixReadOnly(getComputedStyle(sheet).transform).a : 1;
  return Math.max(1, z / (m || 1));
}

function normalized(box: DOMRect, p: Point): Point {
  return { x: clamp((p.x - box.left) / box.width, 0, 1), y: clamp((p.y - box.top) / box.height, 0, 1) };
}

/** The printed issue, page by page. The page follows the finger and settles by distance and speed; arrows
 *  move in reading direction. Only the open pages and their neighbors load up front. */
export default function PageViewer({ lang, issue, pages, base, page, onPage, reader, wide = false, handle, endHref, onZoom, onTap, overlay, marking, snap, onMarkDrawn }: Props) {
  const [own, setOwn] = useState(page ?? 1);
  const p = page ?? own;
  const [live, setLive] = useState(false);
  const [seen, setSeen] = useState<ReadonlySet<number>>(new Set());
  const stageEl = useRef<HTMLDivElement>(null);
  const trackEl = useRef<HTMLDivElement>(null);
  const stripEl = useRef<HTMLDivElement>(null);
  const engine = useRef<Stage | null>(null);
  const preloaded = useRef(new Map<number, HTMLImageElement>());
  /** Set when a vector page is missing: a fresh clone may have only the JPEGs. */
  const noVector = useRef(false);
  const pendingFocus = useRef<{ page: number; region: Rect; topInset: number } | null>(null);
  const draft = useRef<{ el: HTMLElement; box: HTMLElement; page: number; from: Point; rects: Rect[] | null; target: Element } | null>(null);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const visible = visiblePages(pages, p, wide);
  const visibleKey = visible.join('-');
  const prevPage = stepPage(pages, p, -1, wide);
  const nextPage = stepPage(pages, p, 1, wide);

  function commit(n: number) {
    setOwn(n);
    onPage?.(n);
  }
  const shown = (n: number) => (reader && !noVector.current ? vector(base, n) : lowRes(base, n));
  /** Shows a page once it is decoded, so nothing flashes on the way. */
  function jump(n: number) {
    if (n === p || n < 1 || n > pages) return;
    const im = preloaded.current.get(n) ?? new Image();
    if (!im.src) im.src = shown(n);
    im.decode().catch(() => {}).then(() => commit(n));
  }
  function step(d: 1 | -1) {
    const n = stepPage(pages, p, d, wide);
    if (n === null) {
      if (d === 1 && endHref) location.assign(endHref);
      return;
    }
    if (reader && engine.current) engine.current.turn(d);
    else jump(n);
  }
  /** Fits a region of an open page. Its box comes from the layout, as fractions, so any zoom gives the same answer. */
  function applyFocus(n: number, region: Rect, topInset: number) {
    const sheet = stageEl.current?.querySelector<HTMLElement>('[data-at="cur"] .viewer-sheet');
    const box = sheet?.querySelector<HTMLElement>(`[data-page-box="${n}"]`);
    if (!sheet || !box) return;
    const fx = box.offsetLeft / sheet.offsetWidth;
    const fy = box.offsetTop / sheet.offsetHeight;
    const fw = box.offsetWidth / sheet.offsetWidth;
    const fh = box.offsetHeight / sheet.offsetHeight;
    // Comfortable, not huge: on a laptop the page stays readable at twice its width, on a phone at three times.
    const cap = wide ? 2 : 3;
    engine.current?.moveTo((content, area) =>
      fitRegion(region, { x: fx * content.w, y: fy * content.h, w: fw * content.w, h: fh * content.h }, content, area, { topInset, rtl: true, maxZoom: cap }),
    );
  }
  function focus(n: number, region: Rect | null, topInset: number) {
    if (visible.includes(n)) {
      if (region) applyFocus(n, region, topInset);
      else engine.current?.resetZoom();
      return;
    }
    pendingFocus.current = region ? { page: n, region, topInset } : null;
    jump(n);
  }
  if (handle) handle.current = { step, jump, zoomBy: (d) => engine.current?.zoomBy(d), resetZoom: () => engine.current?.resetZoom(), focus };

  const latest = useRef({ p, pages, wide, onTap, onZoom, snap, onMarkDrawn, commit });
  latest.current = { p, pages, wide, onTap, onZoom, snap, onMarkDrawn, commit };

  useEffect(() => {
    if (!stageEl.current || !trackEl.current) return;
    const L = latest;
    const paint = (el: HTMLElement, rects: Rect[] | null) => {
      el.replaceChildren(
        ...(rects ?? []).map((r) => {
          const span = document.createElement('span');
          span.className = 'page-mark draft';
          Object.assign(span.style, placeInPage(r));
          return span;
        }),
      );
    };
    const s = createStage(
      stageEl.current,
      trackEl.current,
      {
        canTurn: (d) => stepPage(L.current.pages, L.current.p, d, L.current.wide) !== null,
        onLive: setLive,
        onTurn: (d) => {
          const n = stepPage(L.current.pages, L.current.p, d, L.current.wide);
          setLive(false);
          if (n !== null) L.current.commit(n);
          else s.landed();
        },
        onTap: (on) => L.current.onTap?.(on),
        onView: (z) => L.current.onZoom?.(z),
        onMarkStart: (at, on) => {
          const box = on.closest<HTMLElement>('.viewer-page') ?? document.elementFromPoint(at.x, at.y)?.closest<HTMLElement>('.viewer-page');
          if (!box) return;
          const el = document.createElement('div');
          el.className = 'page-draft';
          box.append(el);
          draft.current = { el, box, page: Number(box.dataset.pageBox), from: normalized(box.getBoundingClientRect(), at), rects: null, target: on };
        },
        onMarkMove: (at) => {
          const d = draft.current;
          if (!d) return;
          d.rects = L.current.snap?.(d.page, d.from, normalized(d.box.getBoundingClientRect(), at)) ?? null;
          paint(d.el, d.rects);
        },
        onMarkEnd: (at) => {
          const d = draft.current;
          draft.current = null;
          d?.el.remove();
          if (!d || !at) return;
          if (d.rects) L.current.onMarkDrawn?.(d.page, d.rects);
          else L.current.onTap?.(d.target);
        },
      },
      {
        rtl: dir === 'rtl',
        zoom: !!reader,
        commit: !!reader,
        // Keeps each page's raster under about 4096 device pixels wide; past that the rest of the zoom is a transform.
        maxLayoutZ: () => {
          const sheet = stageEl.current?.querySelector<HTMLElement>('[data-at="cur"] .viewer-sheet');
          const page = sheet?.querySelector<HTMLElement>('.viewer-page');
          const z = engine.current?.zoom() ?? 1;
          if (!page) return z;
          const base = page.offsetWidth / layoutZOf(sheet!, z);
          return 4096 / (Math.max(1, base) * (window.devicePixelRatio || 1));
        },
        content: () => stageEl.current?.querySelector<HTMLElement>('[data-at="cur"] .viewer-sheet') ?? null,
        // A click on a photo opens it at once; a touch waits, since a double tap there still zooms the page.
        instantTap: (on, isMouse) => isMouse && !!on.closest('[data-photo-page]'),
      },
    );
    engine.current = s;
    return () => {
      s.destroy();
      engine.current = null;
    };
  }, []);

  useEffect(() => engine.current?.setMarking(!!marking), [marking]);

  // The new page is in the DOM; the track goes back to rest before the browser paints.
  useLayoutEffect(() => engine.current?.landed(), [visibleKey]);

  // Arrived on a page with a story to fit: one movement from the whole page in to the story.
  useEffect(() => {
    const f = pendingFocus.current;
    if (f && visible.includes(f.page)) {
      pendingFocus.current = null;
      applyFocus(f.page, f.region, f.topInset);
    }
  }, [visibleKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.target as HTMLElement).closest('input, textarea, select') || document.querySelector('dialog[open]')) return;
      const s = engine.current;
      if (e.key === 'ArrowLeft') step(dir === 'rtl' ? 1 : -1);
      else if (e.key === 'ArrowRight') step(dir === 'rtl' ? -1 : 1);
      else if (reader && (e.key === '+' || e.key === '=')) s?.zoomBy(1);
      else if (reader && e.key === '-') s?.zoomBy(-1);
      else if (reader && e.key === 'Escape' && s && s.zoom() > 1) s.resetZoom();
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  // Neighbors decode ahead of time, so the next turn shows a finished page.
  useEffect(() => {
    for (const n of neighborPages(pages, p, wide)) {
      if (preloaded.current.has(n)) continue;
      const im = new Image();
      im.src = shown(n);
      im.decode().catch(() => {});
      preloaded.current.set(n, im);
    }
  }, [visibleKey, pages, base, wide]);

  // The archive page's strip of thumbnails loads what scrolls into view.
  useEffect(() => {
    const root = stripEl.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      const hits = entries.filter((x) => x.isIntersecting).map((x) => Number((x.target as HTMLElement).dataset.thumb));
      if (hits.length) setSeen((s) => new Set([...s, ...hits]));
    });
    root.querySelectorAll('[data-thumb]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pages]);

  const image = (n: number) => (
    <img
      src={shown(n)}
      alt={t(lang, 'story.printedAlt', { n })}
      width={918}
      height={1298}
      data-page={n}
      draggable={false}
      decoding="async"
      onError={(e) => {
        // The JPEG stands in when this copy of the site has no vector pages.
        if (!reader || noVector.current) return;
        noVector.current = true;
        e.currentTarget.src = lowRes(base, n);
      }}
    />
  );
  const panel = (at: 'prev' | 'cur' | 'next', list: number[]) => (
    <div class="viewer-panel" data-at={at} key={list.join('-')} aria-hidden={at === 'cur' ? undefined : 'true'}>
      {reader ? (
        // The magazine is Arabic in either interface language: its first page sits on the right.
        <div class="viewer-sheet" dir="rtl" data-wide={wide ? 'true' : undefined}>
          {list.map((n) => (
            <div
              class="viewer-page"
              key={n}
              data-page-box={n}
              data-slot={wide && list.length === 1 ? (n === 1 ? 'start' : 'end') : undefined}
              // The picture of the page sits underneath, so a raster gap in the vector layer never shows blank paper.
              style={{ backgroundImage: `url("${lowRes(base, n)}")` }}
            >
              {image(n)}
              {at === 'cur' && overlay?.(n)}
            </div>
          ))}
        </div>
      ) : (
        list.map((n) => image(n))
      )}
    </div>
  );

  const stage = (
    <div ref={stageEl} class="viewer-stage">
      <div ref={trackEl} class="viewer-track">
        {live && prevPage !== null && panel('prev', visiblePages(pages, prevPage, wide))}
        {panel('cur', visible)}
        {live && nextPage !== null && panel('next', visiblePages(pages, nextPage, wide))}
      </div>
    </div>
  );
  if (reader) return stage;

  return (
    <div class="viewer" aria-label={t(lang, 'arch.viewer')}>
      {stage}
      <div class="viewer-nav">
        <button type="button" class="btn sm" onClick={() => step(-1)} disabled={prevPage === null}>{t(lang, 'arch.prevPage')}</button>
        <span class="viewer-count" aria-live="polite">{t(lang, 'arch.page', { k: p, n: pages })}</span>
        <button type="button" class="btn sm" onClick={() => step(1)} disabled={nextPage === null}>{t(lang, 'arch.nextPage')}</button>
      </div>
      <div class="thumbs" role="tablist" aria-label={t(lang, 'arch.viewer')} ref={stripEl}>
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" role="tab" data-thumb={n} aria-selected={n === p} class={`thumb${n === p ? ' sel' : ''}`} onClick={() => jump(n)} aria-label={t(lang, 'arch.page', { k: n, n: pages })}>
            <img src={n === p || seen.has(n) ? lowRes(base, n) : undefined} alt="" width={92} height={130} />
          </button>
        ))}
      </div>
      <p class="sr">{t(lang, 'arch.issue', { n: issue })}</p>
    </div>
  );
}

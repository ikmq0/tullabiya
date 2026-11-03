import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '~/i18n';
import { photoFit, type Size } from '~/lib/gesture';
import { latin } from '~/lib/latin';
import type { Lang } from '~/lib/model';
import { cropStyle, photoSource, type PagePhoto } from '~/lib/pageLayout';
import { createStage, type Stage } from '~/lib/stage';

interface PageStoryLink {
  id: string;
  title: string;
}

interface Props {
  lang: Lang;
  base: string;
  page: number;
  start: number;
  photos: PagePhoto[];
  stories: PageStoryLink[];
  onClose: () => void;
  onGoStory: (id: string) => void;
}

const OPEN_MS = 380;
const CLOSE_MS = 300;
/** Room kept clear for the top bar and the list of the page's stories. */
const CHROME = 56;
const easing = () => getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() || 'ease-out';
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A photo from a printed page, full screen. It grows from its exact place on the page and returns to it. It opens
 *  at a size its pixels can carry, zooms only as far as they allow, and swipes between the page's photos.
 *  Escape, back, the close button and a swipe down at fit size all close it. */
export default function PagePhotos({ lang, base, page, start, photos, stories, onClose, onGoStory }: Props) {
  const [index, setIndex] = useState(start);
  const [live, setLive] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Size | null>(null);
  const [natural, setNatural] = useState<Record<number, { w: number; h: number }>>({});
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(new Set());
  const dialog = useRef<HTMLDialogElement>(null);
  const stageEl = useRef<HTMLDivElement>(null);
  const flyEl = useRef<HTMLDivElement>(null);
  const trackEl = useRef<HTMLDivElement>(null);
  const engine = useRef<Stage | null>(null);
  const pushed = useRef(false);
  const closing = useRef(false);
  const flight = useRef<Animation | null>(null);
  const afterClose = useRef<string | null>(null);
  const opened = useRef(false);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const n = String(page).padStart(2, '0');
  const pageJpeg = `${base}p${n}.jpg`;
  const pageVector = `${base}v${n}.svg`;

  const fitOf = (i: number) => {
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    const a = area ?? { w: 1, h: 1 };
    return photoFit(photoSource(photos[i], natural[i]), { w: a.w, h: Math.max(1, a.h - CHROME * 2) }, dpr);
  };
  const latest = useRef({ index, fit: { w: 1, h: 1, maxZoom: 1 } });
  latest.current = { index, fit: area && photos[index] ? fitOf(index) : { w: 1, h: 1, maxZoom: 1 } };

  /** The transform that sits the current photo exactly over its place on the page. */
  function toPage(): string | null {
    const box = stageEl.current?.querySelector('[data-at="cur"] .photo-box')?.getBoundingClientRect();
    const hit = document.querySelector(`[data-photo-page="${page}"][data-photo-index="${latest.current.index}"]`)?.getBoundingClientRect();
    const fly = flyEl.current?.getBoundingClientRect();
    if (!box || !hit || !fly || !box.width || !hit.width) return null;
    const s = hit.width / box.width;
    const cx = fly.left + fly.width / 2;
    const cy = fly.top + fly.height / 2;
    const bx = box.left + box.width / 2;
    const by = box.top + box.height / 2;
    const tx = hit.left + hit.width / 2 - (cx + (bx - cx) * s);
    const ty = hit.top + hit.height / 2 - (cy + (by - cy) * s);
    return `translate(${tx}px, ${ty}px) scale(${s})`;
  }

  function finish() {
    dialog.current?.close();
    const story = afterClose.current;
    onClose();
    if (story) onGoStory(story);
  }

  function runClose() {
    if (closing.current) return;
    closing.current = true;
    const fly = flyEl.current;
    if (calm() || !fly) {
      const a = dialog.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120 });
      if (a) a.onfinish = finish;
      else finish();
      return;
    }
    // Starts from wherever it is on screen, so closing mid-opening just turns around.
    const from = getComputedStyle(fly).transform;
    flight.current?.cancel();
    const to = toPage();
    if (!to) return finish();
    const a = fly.animate([{ transform: from === 'none' ? 'none' : from }, { transform: to }], { duration: CLOSE_MS, easing: easing(), fill: 'forwards' });
    a.onfinish = finish;
  }

  /** Every way out goes through history, so the back button keeps its meaning. */
  function requestClose() {
    if (pushed.current) {
      pushed.current = false;
      history.back();
    } else {
      runClose();
    }
  }

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    history.pushState({ pagePhoto: true }, '');
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      runClose();
    };
    addEventListener('popstate', onPop);
    const measure = () => {
      const st = stageEl.current;
      if (st) setArea({ w: st.clientWidth, h: st.clientHeight });
    };
    measure();
    addEventListener('resize', measure);
    if (!stageEl.current || !trackEl.current) return () => removeEventListener('popstate', onPop);
    const s = createStage(
      stageEl.current,
      trackEl.current,
      {
        canTurn: (d2) => latest.current.index + d2 >= 0 && latest.current.index + d2 < photos.length,
        onLive: setLive,
        onTurn: (d2) => {
          setLive(false);
          setIndex((i) => i + d2);
        },
        onView: setZoom,
        // A tap on the clear area around the photo closes it.
        onTap: (on) => {
          if (!on.closest('.photo-box')) requestClose();
        },
        onDismiss: requestClose,
      },
      {
        rtl: dir === 'rtl',
        zoom: true,
        dismissDown: true,
        maxZoom: () => latest.current.fit.maxZoom,
        instantTap: (on) => !on.closest('.photo-box'),
        content: () => stageEl.current?.querySelector<HTMLElement>('[data-at="cur"] .viewer-sheet') ?? null,
      },
    );
    engine.current = s;
    return () => {
      removeEventListener('popstate', onPop);
      removeEventListener('resize', measure);
      s.destroy();
      engine.current = null;
    };
  }, []);

  // The opening: from its place on the page into the viewer.
  useLayoutEffect(() => {
    if (!area || opened.current) return;
    opened.current = true;
    if (calm()) {
      dialog.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
      return;
    }
    const from = toPage();
    const fly = flyEl.current;
    if (from && fly) flight.current = fly.animate([{ transform: from }, { transform: 'none' }], { duration: OPEN_MS, easing: easing() });
  }, [area]);

  useLayoutEffect(() => engine.current?.landed(), [index]);

  // Neighbors decode ahead, one step on either side, so a swipe finds them finished.
  useEffect(() => {
    for (const i of [index - 1, index + 1]) {
      const file = photos[i]?.file;
      if (file) {
        const im = new Image();
        im.src = base + file;
        im.decode().catch(() => {});
      }
    }
  }, [index]);

  function onKey(e: KeyboardEvent) {
    const s = engine.current;
    if (e.key === 'ArrowLeft') s?.turn(dir === 'rtl' ? 1 : -1);
    else if (e.key === 'ArrowRight') s?.turn(dir === 'rtl' ? -1 : 1);
    else if (e.key === '+' || e.key === '=') s?.zoomBy(1);
    else if (e.key === '-') s?.zoomBy(-1);
    else return;
    e.preventDefault();
  }

  const panel = (at: 'prev' | 'cur' | 'next', i: number) => {
    const photo = photos[i];
    if (!photo || !area) return null;
    const fit = fitOf(i);
    const label = t(lang, 'rd.photoOn', { k: i + 1, n: page });
    const turned = photo.rot === 1 || photo.rot === 3;
    return (
      <div class="viewer-panel" data-at={at} key={i} aria-hidden={at === 'cur' ? undefined : 'true'}>
        <div class="viewer-sheet" style={{ inlineSize: `${fit.w}px`, blockSize: `${fit.h}px` }}>
          {/* The page's own low-res picture holds the place until the original has decoded, at the same size. */}
          <div class="photo-box" dir="ltr" role={photo.file ? undefined : 'img'} aria-label={photo.file ? undefined : label} style={cropStyle(photo.file ? pageJpeg : pageVector, photo.rect)}>
            {photo.file && (
              <img
                class="photo-img"
                data-loaded={loaded.has(i) ? 'true' : undefined}
                src={base + photo.file}
                alt={label}
                draggable={false}
                decoding="async"
                style={
                  photo.rot
                    ? {
                        inlineSize: `${turned ? fit.h : fit.w}px`,
                        blockSize: `${turned ? fit.w : fit.h}px`,
                        transform: `translate(-50%, -50%) rotate(${photo.rot * 90}deg)`,
                      }
                    : undefined
                }
                onLoad={(e) => {
                  const img = e.currentTarget;
                  // A larger file from the editors raises the limit by itself.
                  setNatural((m) => (m[i]?.w === img.naturalWidth ? m : { ...m, [i]: { w: img.naturalWidth, h: img.naturalHeight } }));
                  void img.decode().catch(() => {}).then(() => setLoaded((s) => new Set([...s, i])));
                }}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <dialog
      ref={dialog}
      class="photo-viewer"
      aria-label={t(lang, 'rd.photoOn', { k: index + 1, n: page })}
      onKeyDown={onKey}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
    >
      <div ref={stageEl} class="viewer-stage photo-stage">
        <div ref={flyEl} class="photo-fly">
          <div ref={trackEl} class="viewer-track">
            {live && panel('prev', index - 1)}
            {panel('cur', index)}
            {live && panel('next', index + 1)}
          </div>
        </div>
      </div>
      <header class="photo-top">
        <button type="button" class="rd-btn" onClick={requestClose} aria-label={t(lang, 'common.close')}>
          <span aria-hidden="true">×</span>
        </button>
        {photos.length > 1 && <span class="photo-count">{t(lang, 'photo.count', { k: index + 1, n: photos.length })}</span>}
        <span class="rd-gap" />
        <button type="button" class="rd-btn" onClick={() => engine.current?.zoomBy(-1)} disabled={zoom <= 1} aria-label={t(lang, 'read.zoomOut')}>
          <span aria-hidden="true">−</span>
        </button>
        <button type="button" class="rd-btn" data-zoom-in onClick={() => engine.current?.zoomBy(1)} disabled={area ? zoom >= fitOf(index).maxZoom - 0.01 : false} aria-label={t(lang, 'read.zoomIn')}>
          <span aria-hidden="true">+</span>
        </button>
      </header>
      {stories.length > 0 && (
        <details class="photo-more">
          <summary>{t(lang, 'read.onPage')}</summary>
          <ul>
            {stories.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    afterClose.current = s.id;
                    requestClose();
                  }}
                >
                  {latin(s.title)}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </dialog>
  );
}

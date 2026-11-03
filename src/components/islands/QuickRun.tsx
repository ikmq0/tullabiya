import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { t, tp } from '~/i18n';
import type { Lang, SectionId } from '~/lib/model';
import { $favorites, $progress, $ready, hydrate, markProgress } from '~/lib/store';
import { useMounted } from '~/lib/useMounted';

interface Props {
  lang: Lang;
  issue: number;
  /** Root of the slabs (a selector); each slab carries data-section and data-min. */
  listSelector: string;
}

/** Runs the 5-minute version: pinned sections first, a minutes-left line that follows the reader,
 *  and the finish line that records the digest once it has been reached. */
export default function QuickRun({ lang, issue, listSelector }: Props) {
  const favsStore = useStore($favorites);
  const progressStore = useStore($progress);
  const ready = useStore($ready);
  const mounted = useMounted();
  const favs = mounted ? favsStore : null;
  const progress = mounted ? progressStore : null;
  const [left, setLeft] = useState<number | null>(null);
  const [current, setCurrent] = useState<string>('');
  const [done, setDone] = useState(false);
  const ordered = useRef(false);

  useEffect(() => void hydrate(issue), [issue]);

  // Pinned sections first, once, as soon as the pins are known (the store says when they are).
  useEffect(() => {
    if (!ready || !favs || ordered.current) return;
    ordered.current = true;
    const list = document.querySelector<HTMLElement>(listSelector);
    if (!list || !favs.sections.length) return;
    const slabs = [...list.querySelectorAll<HTMLElement>('[data-section]')];
    const pinned = new Set<string>(favs.sections);
    const rank = (el: HTMLElement) => (pinned.has(el.dataset.section as SectionId) ? 0 : 1);
    slabs
      .map((el, i) => ({ el, i, r: rank(el) }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .forEach(({ el }) => list.appendChild(el));
    const end = list.querySelector<HTMLElement>('[data-quick-end]');
    if (end) list.appendChild(end);
  }, [ready, favs, listSelector]);

  // Minutes left: the slabs from the current one on. The current slab is the first one whose
  // bottom is still below the upper third of the viewport.
  useEffect(() => {
    const list = document.querySelector<HTMLElement>(listSelector);
    if (!list) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const slabs = [...list.querySelectorAll<HTMLElement>('[data-section]')];
      const line = window.innerHeight * 0.35;
      let idx = slabs.findIndex((el) => el.getBoundingClientRect().bottom > line);
      if (idx < 0) idx = slabs.length;
      const rest = slabs.slice(idx).reduce((a, el) => a + Number(el.dataset.min ?? 0), 0);
      setLeft(Math.ceil(rest));
      setCurrent(idx < slabs.length ? (slabs[idx].dataset.section ?? '') : '');
      const end = list.querySelector<HTMLElement>('[data-quick-end]');
      if (end && end.getBoundingClientRect().top < window.innerHeight * 0.9) setDone(true);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [listSelector]);

  useEffect(() => {
    if (done && progress && !progress.digestDone) void markProgress(issue, { digestDone: true });
  }, [done, progress, issue]);

  const finished = done || !!progress?.digestDone;
  return (
    <p class="quick-line" aria-live="polite" data-current={current} data-left={left ?? ''} data-done={finished ? 'true' : 'false'}>
      {finished && left === 0 ? t(lang, 'quick.done') : left === null ? '' : tp(lang, 'quick.left', left)}
    </p>
  );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '~/i18n';
import type { Lang } from '~/lib/model';

export interface RailSection {
  id: string;
  label: string;
  /** Selector of the section on the page. */
  selector: string;
  minutes: number;
}

interface Props {
  lang: Lang;
  sections: RailSection[];
}

const IDLE_MS = 1400;

/** Where you are in the issue, not how well you did: one notch per section at the page's edge, with
 *  the section's name and the minutes left (in the issue, and in this section) while you scroll. */
export default function EditionRail({ lang, sections }: Props) {
  const [idx, setIdx] = useState(-1);
  const [left, setLeft] = useState(0);
  const [here, setHere] = useState(0);
  const [active, setActive] = useState(false);
  const timer = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    const els = sections.map((s) => document.querySelector<HTMLElement>(s.selector));
    const measure = () => {
      raf.current = 0;
      const line = window.innerHeight * 0.4;
      let cur = -1;
      let p = 0;
      els.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top <= line) {
          cur = i;
          p = Math.min(1, Math.max(0, (line - r.top) / Math.max(1, r.height)));
        }
      });
      const past = els[els.length - 1]?.getBoundingClientRect().bottom ?? 0;
      if (cur < 0 || past < line) {
        setIdx(-1);
        return;
      }
      const rest = sections.slice(cur + 1).reduce((a, s) => a + s.minutes, 0);
      const inThis = sections[cur].minutes * (1 - p);
      setIdx(cur);
      setHere(Math.ceil(inThis));
      setLeft(Math.ceil(rest + inThis));
    };
    const onScroll = () => {
      if (!raf.current) raf.current = requestAnimationFrame(measure);
      setActive(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setActive(false), IDLE_MS);
    };
    measure();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      clearTimeout(timer.current);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [sections]);

  const shown = idx >= 0;
  return (
    <div class="rail" aria-hidden="true" data-active={active && shown ? 'true' : 'false'} data-shown={shown ? 'true' : 'false'} data-section={shown ? sections[idx].id : ''} data-left={shown ? left : ''}>
      <div class="rail-notches">
        {sections.map((s, i) => (
          <i key={s.id} class={`rail-notch${i < idx ? ' past' : ''}${i === idx ? ' now' : ''}`} style={{ flexGrow: s.minutes }} />
        ))}
      </div>
      <div class="rail-label">
        {shown && (
          <>
            <b>{sections[idx].label}</b>
            <span>{t(lang, 'rail.left', { n: left, m: here })}</span>
          </>
        )}
      </div>
    </div>
  );
}

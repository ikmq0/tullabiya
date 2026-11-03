import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { t, tp } from '~/i18n';
import type { Lang } from '~/lib/model';
import { $toast } from '~/lib/store';
import type { StampId, TrackId } from '~/lib/stamps';

/** "Issues · 10 issues": the track's name and the tier it marks. */
export function stampName(lang: Lang, id: StampId): string {
  const i = id.lastIndexOf('-');
  const track = id.slice(0, i) as TrackId;
  const n = Number(id.slice(i + 1));
  return `${t(lang, `track.${track}.name`)} · ${tp(lang, `track.${track}.tier`, n)}`;
}

const SHOW_MS = 5200;

/** The octagon stamp, filled in your color. */
export function StampMark({ on, size = 28, label }: { on: boolean; size?: number; label?: string | number }) {
  return (
    <svg class="stamp-mark" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M8.5 2h7l6.5 6.5v7L15.5 22h-7L2 15.5v-7z" fill={on ? 'var(--me, var(--turq))' : 'none'} stroke="currentColor" stroke-width={on ? 0 : 1.8} stroke-linejoin="round" />
      {label !== undefined ? (
        <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-family="var(--font-display)" font-weight="700" font-size={String(label).length > 1 ? 9 : 10} fill={on ? 'var(--me-ink, var(--ink))' : 'currentColor'}>
          {label}
        </text>
      ) : (
        on && <path d="M7.5 12.2l3 3 6-6.4" fill="none" stroke="var(--me-ink, var(--ink))" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      )}
    </svg>
  );
}

/** A new stamp slides up from the bottom for five seconds; rare, so it may be a little bigger than
 *  a toast needs to be. */
export default function StampToast({ lang }: { lang: Lang }) {
  const id = useStore($toast);
  const [shown, setShown] = useState<StampId | null>(null);
  useEffect(() => {
    if (!id) return;
    setShown(id);
    const timer = setTimeout(() => {
      setShown(null);
      $toast.set(null);
    }, SHOW_MS);
    return () => clearTimeout(timer);
  }, [id]);
  const close = () => {
    setShown(null);
    $toast.set(null);
  };
  return (
    <div class="toast" data-open={shown ? 'true' : 'false'} role="status" aria-live="polite" data-stamp={shown ?? ''}>
      {shown && (
        <>
          <StampMark on size={40} />
          <div>
            <b>{t(lang, 'toast.stamp', { name: stampName(lang, shown) })}</b>
            <a href={`/${lang}/my/#my-stamps`}>{t(lang, 'toast.see')}</a>
          </div>
          <button type="button" class="tool" onClick={close} aria-label={t(lang, 'toast.close')}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </>
      )}
    </div>
  );
}

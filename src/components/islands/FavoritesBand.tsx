import { useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { t, L } from '~/i18n';
import { EMPTY_FAVORITES, SECTIONS, type Lang, type SectionId } from '~/lib/model';
import { $favorites, $forYou, $profile, $progress, $sheet, hydrate, togglePinnedSection } from '~/lib/store';
import { sectionsReadCount } from '~/lib/progress';
import { isForMe } from '~/lib/personalization';
import { applyForYou } from '~/lib/foryou';
import Star from './Star';
import ForYouToggle from './ForYouToggle';
import { useMounted } from '~/lib/useMounted';

export interface FavItem {
  kind: 'story' | 'event';
  id: string;
  title: string;
  /** Minutes for a story, the date for an event. */
  meta: string;
  href: string;
  unitIds?: string[];
  unitId?: string;
  section?: SectionId;
}

interface Props {
  lang: Lang;
  issue: number;
  /** Everything in the issue that could be for the reader; the band keeps what matches. */
  items: FavItem[];
}

/** Pin sections, see what your follows brought this month, narrow the page to it; progress as five bars. */
export default function FavoritesBand({ lang, issue, items }: Props) {
  const favsStore = useStore($favorites);
  const progressStore = useStore($progress);
  const profileStore = useStore($profile);
  const forYou = useStore($forYou);
  const mounted = useMounted();
  const favs = mounted ? favsStore : EMPTY_FAVORITES;
  const progress = mounted ? progressStore : null;
  const profile = mounted ? profileStore : null;
  useEffect(() => void hydrate(issue), [issue]);
  useEffect(() => applyForYou(mounted && forYou, favs), [mounted, forYou, favs]);
  const read = sectionsReadCount(progress ?? undefined);
  const readSet = new Set(progress?.sectionsRead ?? []);
  const following = favs.sections.length + favs.units.length > 0;
  const mine = items.filter((it) => isForMe(it, favs)).slice(0, 4);
  const kindLabel = (it: FavItem) => (it.kind === 'event' ? t(lang, 'favs.event') : L(SECTIONS.find((s) => s.id === it.section)!.name, lang));

  return (
    <>
      <div class="favs-in">
        <div>
          <h2 id="favs-title">{t(lang, 'favs.title')}</h2>
          <p class="lead">{t(lang, 'favs.lead')}</p>
          <div class="chips" role="group" aria-labelledby="favs-title">
            {SECTIONS.map((s) => {
              const on = favs.sections.includes(s.id);
              const label = L(s.name, lang);
              return (
                <button
                  key={s.id}
                  type="button"
                  class="chip pin"
                  aria-pressed={on}
                  aria-label={t(lang, on ? 'favs.unpin' : 'favs.pin', { section: label })}
                  onClick={() => void togglePinnedSection(s.id)}
                >
                  <Star on={on} />
                  <span aria-hidden="true">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div class="progress" aria-live="polite">
          <strong>{t(lang, 'favs.progress', { k: read, n: SECTIONS.length, address: profile?.address ?? 'neutral' })}</strong>
          <div class="pbars" aria-hidden="true">
            {SECTIONS.map((s) => (
              <i key={s.id} class={`fast-bar${readSet.has(s.id) ? ' on' : ''}`} />
            ))}
          </div>
        </div>
      </div>
      <div class="favs-items" data-following={following ? 'true' : 'false'}>
        <div class="favs-items-head">
          <h3>{t(lang, 'favs.items')}</h3>
          <ForYouToggle lang={lang} />
        </div>
        {!following && (
          <p class="favs-empty">
            {t(lang, 'favs.noneYet')}{' '}
            <button type="button" class="btn sm ghost" onClick={() => $sheet.set('onboarding')}>{t(lang, 'favs.choose')}</button>
          </p>
        )}
        {following && mine.length === 0 && <p class="favs-empty">{t(lang, 'favs.nothingNew')}</p>}
        {mine.length > 0 && (
          <ul class="fav-list">
            {mine.map((it) => (
              <li key={it.id}>
                <a href={it.href}>
                  <span class="fav-title">{it.title}</span>
                  <span class="fav-meta">{kindLabel(it)} · {it.meta}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

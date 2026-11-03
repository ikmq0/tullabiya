import { useStore } from '@nanostores/preact';
import { t } from '~/i18n';
import type { Lang } from '~/lib/model';
import { $favorites, $forYou, setForYou } from '~/lib/store';
import { useMounted } from '~/lib/useMounted';
import Star from './Star';

/** One chip, wherever a list can narrow to what the reader follows and pinned. */
export default function ForYouToggle({ lang }: { lang: Lang }) {
  const on = useStore($forYou);
  const favs = useStore($favorites);
  const mounted = useMounted();
  const has = favs.sections.length + favs.units.length > 0;
  const active = mounted && on && has;
  return (
    <button type="button" class="chip pin foryou" aria-pressed={active} disabled={mounted && !has} title={mounted && !has ? t(lang, 'foryou.empty') : undefined} onClick={() => setForYou(!on)}>
      <Star on={active} />
      {t(lang, 'foryou.only')}
    </button>
  );
}

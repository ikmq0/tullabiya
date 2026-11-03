import { useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { Lang } from '~/lib/model';
import { $favorites, $forYou, ensureFavorites } from '~/lib/store';
import { applyForYou } from '~/lib/foryou';
import ForYouToggle from './ForYouToggle';

/** The chip plus the effect that marks every data-fy row on the page. */
export default function ForYouFilter({ lang }: { lang: Lang }) {
  const on = useStore($forYou);
  const favs = useStore($favorites);
  useEffect(() => void ensureFavorites(), []);
  useEffect(() => applyForYou(on, favs), [on, favs]);
  return <ForYouToggle lang={lang} />;
}

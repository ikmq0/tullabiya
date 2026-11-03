// "For you" on server-rendered lists: every row that carries data-fy says which publishers and
// section it belongs to; this marks the ones for the reader and, with the toggle on, dims or hides
// the rest (CSS decides which, per page).
import type { Favorites } from '~/lib/model';
import { isForMe } from '~/lib/personalization';

export function applyForYou(on: boolean, favs: Favorites): void {
  if (typeof document === 'undefined') return;
  const has = favs.sections.length + favs.units.length > 0;
  document.documentElement.toggleAttribute('data-foryou', on && has);
  for (const el of document.querySelectorAll<HTMLElement>('[data-fy]')) {
    const unitIds = (el.dataset.units ?? '').split(',').filter(Boolean);
    const section = (el.dataset.section || undefined) as never;
    el.dataset.fy = has && isForMe({ unitIds, section }, favs) ? '1' : '0';
  }
  for (const list of document.querySelectorAll<HTMLElement>('[data-fy-list]')) {
    const rows = list.querySelectorAll<HTMLElement>('[data-fy]');
    const shown = [...rows].filter((r) => !(on && has) || r.dataset.fy === '1').length;
    const empty = list.querySelector<HTMLElement>('[data-fy-empty]');
    if (empty) empty.hidden = !(on && has && rows.length > 0 && shown === 0);
  }
}

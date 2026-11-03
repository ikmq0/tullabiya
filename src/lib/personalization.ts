// What the reader follows (publishers) and pinned (sections) decides what is for them and comes first.
import type { Favorites, SectionId } from '~/lib/model';

export interface ForMe {
  unitId?: string;
  unitIds?: string[];
  section?: SectionId;
}

/** True when the item comes from a followed publisher or sits in a pinned section. */
export function isForMe(item: ForMe, favs: Favorites): boolean {
  if (item.unitId && favs.units.includes(item.unitId)) return true;
  if (item.unitIds?.some((u) => favs.units.includes(u))) return true;
  if (item.section && favs.sections.includes(item.section)) return true;
  return false;
}

/** Stable: items for the reader first, then everything else in its own order. */
export function orderForYou<T extends ForMe>(items: T[], favs: Favorites): T[] {
  return items
    .map((x, i) => ({ x, i, r: isForMe(x, favs) ? 0 : 1 }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((o) => o.x);
}

export function countForMe<T extends ForMe>(items: T[], favs: Favorites): number {
  return items.filter((x) => isForMe(x, favs)).length;
}

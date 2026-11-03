// The month as thirty bars: tall where campus is busy, in your color where a publisher you follow is on.
import type { EventItem, Favorites } from '~/lib/model';
import { isForMe } from '~/lib/personalization';

export interface StripDay {
  day: number;
  iso: string;
  heightPct: number;
  kind: 'quiet' | 'all' | 'mine';
  events: EventItem[];
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isoDay(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Events touching a date, multi-day spans included. */
export function eventsOnDay(events: EventItem[], iso: string): EventItem[] {
  return events.filter((e) => {
    const s = e.start.slice(0, 10);
    const en = (e.end ?? e.start).slice(0, 10);
    return iso >= s && iso <= en;
  });
}

/** Deterministic quiet-day heights so the skyline is stable between renders. */
function quietHeight(year: number, month: number, day: number): number {
  let x = (year * 372 + month * 31 + day) * 2654435761;
  x = (x ^ (x >>> 15)) >>> 0;
  return 20 + (x % 25);
}

export function buildStrip(events: EventItem[], year: number, month: number, favs: Favorites): StripDay[] {
  const n = daysInMonth(year, month);
  const out: StripDay[] = [];
  for (let d = 1; d <= n; d++) {
    const iso = isoDay(year, month, d);
    const evs = eventsOnDay(events, iso);
    const mine = evs.some((e) => isForMe(e, favs));
    const heightPct = evs.length ? Math.min(100, 48 + evs.length * 26 + (d % 3) * 4) : quietHeight(year, month, d);
    out.push({ day: d, iso, heightPct, kind: mine ? 'mine' : evs.length ? 'all' : 'quiet', events: evs });
  }
  return out;
}

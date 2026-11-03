import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { L, t, formatDate } from '~/i18n';
import { type EventItem, type EventKind, type Lang } from '~/lib/model';
import { buildMonthGrid, weekdayLabels } from '~/lib/calendarGrid';
import { eventsOnDay, isoDay } from '~/lib/strip';
import { isForMe } from '~/lib/personalization';
import ForYouToggle from './ForYouToggle';
import { toIcsEvent } from '~/lib/ics';
import { getApi } from '~/lib/api';
import { $favorites, $forYou, hydrate } from '~/lib/store';
import AddToCalendar, { downloadIcs } from './AddToCalendar';
import { latin } from '~/lib/latin';

interface Props {
  lang: Lang;
  issue: number;
  year: number;
  month: number;
  monthLabel: string;
  events: EventItem[];
  unitNames: Record<string, string>;
  feedPath: string;
}

const KINDS: EventKind[] = ['career', 'culture', 'national', 'conference', 'competition'];

/** Grid or list, narrowed to what you follow and by kind; every event adds to a calendar; the whole month in one file. */
export default function CalendarView({ lang, issue, year, month, monthLabel, events, unitNames, feedPath }: Props) {
  const favs = useStore($favorites);
  const forYou = useStore($forYou);
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [kind, setKind] = useState<'all' | EventKind>('all');
  const [day, setDay] = useState<number | null>(null);
  const [reminders, setReminders] = useState<string[]>([]);
  const [webcal, setWebcal] = useState('');

  useEffect(() => {
    hydrate(issue);
    getApi().getReminders().then(setReminders);
    setWebcal(`webcal://${location.host}${feedPath}`);
    setView(matchMedia('(min-width: 768px)').matches ? 'grid' : 'list');
  }, [issue, feedPath]);

  const filtered = useMemo(
    () =>
      events.filter((e) => (!forYou || isForMe(e, favs)) && (kind === 'all' || e.kind === kind)),
    [events, forYou, favs, kind],
  );
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const labels = weekdayLabels(lang === 'ar' ? 'ar-SA' : 'en-GB');
  const shown = day ? eventsOnDay(filtered, isoDay(year, month, day)) : filtered;

  return (
    <div class="cal">
      <div class="cal-toolbar">
        <div class="seg" role="group" aria-label={t(lang, 'cal.grid') + ' / ' + t(lang, 'cal.list')}>
          <button type="button" class="seg-btn" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>{t(lang, 'cal.grid')}</button>
          <button type="button" class="seg-btn" aria-pressed={view === 'list'} onClick={() => { setView('list'); setDay(null); }}>{t(lang, 'cal.list')}</button>
        </div>
        <ForYouToggle lang={lang} />
        <label class="cal-filter">
          <span>{t(lang, 'cal.filterKind')}</span>
          <select class="field" value={kind} onChange={(e) => setKind((e.currentTarget as HTMLSelectElement).value as never)}>
            <option value="all">{t(lang, 'cal.all')}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>{t(lang, `cal.kind.${k}`)}</option>
            ))}
          </select>
        </label>
        <button type="button" class="btn sm" onClick={() => downloadIcs(filtered.map(toIcsEvent), lang, `tullabiya-${year}-${String(month).padStart(2, '0')}.ics`, lang === 'ar' ? 'تقويم الطلّابية' : 'Al-Tullabiya calendar')}>
          {t(lang, 'cal.addAll')}
        </button>
      </div>

      {view === 'grid' && (
        <div class="cal-grid" role="grid" aria-label={monthLabel}>
          <div class="cal-row cal-head" role="row">
            {labels.map((l) => (
              <div key={l} role="columnheader" class="cal-wd">{l}</div>
            ))}
          </div>
          {grid.map((row, ri) => (
            <div key={ri} class="cal-row" role="row">
              {row.map((d, ci) => {
                if (!d) return <div key={ci} class="cal-cell empty" role="gridcell" aria-hidden="true" />;
                const evs = eventsOnDay(filtered, isoDay(year, month, d));
                return (
                  <button key={ci} type="button" role="gridcell" class={`cal-cell${evs.length ? ' has' : ''}${day === d ? ' sel' : ''}`} aria-selected={day === d} onClick={() => setDay(day === d ? null : d)}>
                    <span class="cal-d">{d}</span>
                    {evs.slice(0, 3).map((e) => (
                      <span key={e.id} class={`cal-ev${isForMe(e, favs) ? ' mine' : ''}`}>{L(e.title, lang)}</span>
                    ))}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <ul class="cal-list" data-count={shown.length} aria-live="polite">
        {shown.length === 0 && <li class="cal-empty">{t(lang, 'cal.noEvents')}</li>}
        {shown.map((e) => (
          <li key={e.id} class="row cal-item">
            <div class="d">
              {Number(e.start.slice(8, 10))}
              <small>{formatDate(lang, e.start.slice(0, 10), { weekday: true, year: false })}</small>
            </div>
            <div>
              <h3>{latin(L(e.title, lang))}</h3>
              <p>{unitNames[e.unitId]} · {t(lang, `cal.kind.${e.kind}`)}</p>
              <p>{L(e.description, lang)}</p>
            </div>
            <div class="acts">
              <AddToCalendar lang={lang} event={toIcsEvent(e)} />
              <button type="button" class={`btn sm${reminders.includes(e.id) ? ' done' : ''}`} aria-pressed={reminders.includes(e.id)} onClick={async () => setReminders(await getApi().toggleReminder(e.id))}>
                {reminders.includes(e.id) ? t(lang, 'month.reminded') : t(lang, 'month.remind')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <section class="subscribe" id="subscribe" aria-labelledby="sub-title">
        <h2 id="sub-title">{t(lang, 'cal.subscribe')}</h2>
        <p>{t(lang, 'cal.subscribeLead')}</p>
        <div class="act-row">
          {webcal && <a class="btn sm" href={webcal}>{t(lang, 'cal.subscribe')}</a>}
          <a class="btn sm ghost" href={feedPath} download>{t(lang, 'cal.download')}</a>
        </div>
      </section>
    </div>
  );
}

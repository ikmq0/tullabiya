import { useEffect, useState } from 'preact/hooks';
import { t, tp } from '~/i18n';
import type { Lang } from '~/lib/model';
import { getApi } from '~/lib/api';
import { now } from '~/lib/clock';
import { daysUntil } from '~/lib/calendarGrid';
import type { IcsEvent } from '~/lib/ics';
import AddToCalendar from './AddToCalendar';
import { latin } from '~/lib/latin';

interface Props {
  lang: Lang;
  event: IcsEvent;
  eventId: string;
  unitId: string;
  day: number;
  weekday: string;
  title: string;
  organizer: string;
  askHref: string;
  /** Days until the event relative to the server-side "today"; recomputed from the client clock after hydration. */
  daysLeft: number;
  startIso: string;
}

/** One opportunity: register (state toggle), add to calendar, ask the organizer. */
export default function OpportunityRow({ lang, event, eventId, unitId, day, weekday, title, organizer, askHref, daysLeft: initialDays, startIso }: Props) {
  const [reg, setReg] = useState<boolean | null>(null);
  const [daysLeft, setDaysLeft] = useState(initialDays);
  useEffect(() => {
    let alive = true;
    getApi().getRegistrations().then((r) => alive && setReg(r.includes(eventId)));
    setDaysLeft(daysUntil(startIso, new Date(now())));
    return () => {
      alive = false;
    };
  }, [eventId, startIso]);
  const toggle = async () => {
    setReg((r) => !r);
    const list = await getApi().toggleRegistration(eventId);
    setReg(list.includes(eventId));
  };
  const ended = daysLeft < 0;
  const left = ended ? t(lang, 'opp.past') : tp(lang, 'opp.daysLeft', daysLeft);

  return (
    <article class="row" data-fy data-units={unitId}>
      <div class="d">
        {day}
        <small>{weekday}</small>
      </div>
      <div>
        <span class="fy-mark" aria-hidden="true">{t(lang, 'foryou.mark')}</span>
        <h3>{latin(title)}</h3>
        <p>{organizer}</p>
        <p class="left">{left}</p>
      </div>
      <div class="acts">
        <button type="button" class={`btn sm${reg ? ' done' : ''}`} aria-pressed={!!reg} onClick={toggle} disabled={reg === null || ended}>
          {reg ? t(lang, 'opp.registered') : t(lang, 'opp.register')}
        </button>
        <AddToCalendar lang={lang} event={event} />
        <a class="btn sm ghost" href={askHref}>{t(lang, 'opp.ask')}</a>
      </div>
    </article>
  );
}

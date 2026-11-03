import { useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { t, tp } from '~/i18n';
import type { Lang } from '~/lib/model';
import { displayName, dirFor } from '~/lib/name';
import { $favorites, $profile, $sheet, $visit, hydrate } from '~/lib/store';
import { useMounted } from '~/lib/useMounted';

interface Props {
  lang: Lang;
  issue: number;
  month: string;
  totalEvents: number;
  /** The organizer of each event this month, so the greeting can count the ones you follow. */
  eventUnits: string[];
}

/** The page's one h1. Server-rendered anonymous; personalized after hydration, with no motion. */
export default function HeroGreeting({ lang, issue, month, totalEvents, eventUnits }: Props) {
  const profileStore = useStore($profile);
  const favs = useStore($favorites);
  const visit = useStore($visit);
  const mounted = useMounted();
  const sinceItems = mounted && visit && !visit.first ? [visit.votesSince > 0 ? tp(lang, 'since.votes', visit.votesSince) : '', visit.newClues > 0 ? t(lang, 'since.clue') : ''].filter(Boolean) : [];
  const since = sinceItems.length ? <p class="hero-since" data-since>{t(lang, 'hero.since', { items: sinceItems.join(lang === 'ar' ? '، ' : ', ') })}</p> : null;
  const profile = mounted ? profileStore : null;
  useEffect(() => void hydrate(issue), [issue]);

  if (!profile) {
    return (
      <>
        <h1 id="hero-title">{t(lang, 'hero.greetingAnon')}</h1>
        <p class="hero-sub">{t(lang, 'hero.subAnon', { issue, month, events: tp(lang, 'events.count', totalEvents) })}</p>
        {since}
        <p class="hero-invite">
          <button type="button" class="btn ghost on-field" onClick={() => $sheet.set('onboarding')}>
            {t(lang, 'hero.personalize')}
          </button>
        </p>
      </>
    );
  }
  const name = displayName(profile.name);
  const n = eventUnits.filter((u) => favs.units.includes(u)).length;
  const greeting = t(lang, 'hero.greeting', { name: '\u0000' }).split('\u0000');
  const long = Array.from(name).length > 9;
  return (
    <>
      <h1 id="hero-title" class={long ? 'long' : undefined}>
        {greeting[0]}
        <bdi dir={dirFor(profile.name)}>{name}</bdi>
        {greeting[1]}
      </h1>
      <p class="hero-sub">
        {n > 0 ? t(lang, 'hero.sub', { issue, month, events: tp(lang, 'events.count', n) }) : t(lang, 'hero.subAnon', { issue, month, events: tp(lang, 'events.count', totalEvents) })}
      </p>
      {since}
    </>
  );
}

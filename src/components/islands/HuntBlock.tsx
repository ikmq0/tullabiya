import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { formatDate, t, tp } from '~/i18n';
import type { Lang } from '~/lib/model';
import { getApi, type HuntState } from '~/lib/api';
import { now } from '~/lib/clock';
import { $profile, hydrate, markProgress } from '~/lib/store';
import { useMounted } from '~/lib/useMounted';

interface Clue {
  text: string;
  photo?: { src: string; alt: string };
}
interface Props {
  lang: Lang;
  issue: number;
  huntId: string;
  month: string;
  clues: Clue[];
  prize: string;
}

/** The month's treasure hunt: a KFUPM logo hidden on campus, one hint a week. The week picker is a
 *  prototype control so the council can see each week's state; "I found it" takes a name and hands
 *  out the pickup code. */
export default function HuntBlock({ lang, issue, huntId, month, clues, prize }: Props) {
  const profileStore = useStore($profile);
  const mounted = useMounted();
  const profile = mounted ? profileStore : null;
  const [state, setState] = useState<HuntState | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    hydrate(issue);
    getApi().getHunt(huntId).then(setState);
  }, [huntId, issue]);
  useEffect(() => {
    if (claiming) setTimeout(() => input.current?.focus(), 30);
  }, [claiming]);

  const daysLeft = state ? Math.max(0, Math.ceil((new Date(state.closesAt).getTime() - now()) / 86_400_000)) : 0;
  // The hints open by the calendar; the picker lets the prototype show any week of the month.
  const unlocked = Math.min(clues.length, week ?? state?.clueIndex ?? 1);
  const nextDate = unlocked < clues.length && state ? `${state.closesAt.slice(0, 8)}${String(1 + 7 * unlocked).padStart(2, '0')}` : null;
  const winner = state?.winner;

  async function claim(e: Event) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setErr(t(lang, 'hunt.nameRequired'));
      input.current?.focus();
      return;
    }
    const r = await getApi().claimFound(huntId, clean);
    setState(r.state);
    if (r.ok) {
      setClaiming(false);
      setName('');
      setErr(null);
      await markProgress(issue, { huntAttempted: true });
    } else {
      setErr(t(lang, r.reason === 'closed' ? 'hunt.closed' : 'hunt.alreadyFound', { month }));
    }
  }

  return (
    <div class="hunt-grid">
      <div>
        <div class="hunt-week" role="group" aria-label={t(lang, 'hunt.weekPick')}>
          <span class="hunt-week-label">{t(lang, 'hunt.weekPick')}</span>
          <span class="seg">
            {clues.map((_, i) => (
              <button key={i} type="button" class="seg-btn" aria-pressed={unlocked === i + 1} onClick={() => setWeek(i + 1)}>
                {t(lang, 'hunt.week', { k: i + 1 })}
              </button>
            ))}
          </span>
        </div>
        <div class="hunt-prog">
          <span>{t(lang, 'hunt.progress', { k: unlocked, n: clues.length, address: profile?.address ?? 'neutral' })}</span>
          <span class="pbars sm" aria-hidden="true">
            {clues.map((_, i) => (
              <i key={i} class={`fast-bar${i < unlocked ? ' on' : ''}`} />
            ))}
          </span>
        </div>
        <ul class="menu hunt-hints" aria-label={t(lang, 'hunt.clue', { k: unlocked })}>
          {clues.slice(0, unlocked).map((c, i) => (
            <li key={i} class="pop-sub" style={{ padding: '4px 0', fontSize: 'var(--text-md)', color: 'inherit' }}>
              {t(lang, 'hunt.clue', { k: i + 1 })}: {c.text}
            </li>
          ))}
        </ul>
        {nextDate && !winner && !state?.closed && (
          <p class="hunt-next" data-next-clue>{t(lang, 'hunt.nextClue', { k: unlocked + 1, date: formatDate(lang, nextDate) })}</p>
        )}
        {winner ? (
          <div class="hunt-msg ok" aria-live="polite" data-winner>
            <p class="hunt-winner">{t(lang, 'hunt.winner', { name: winner.name })}</p>
            <p>{t(lang, 'hunt.code')}</p>
            <span class="hunt-code" data-code>{winner.code}</span>
            <p>{t(lang, 'hunt.codeHint')}</p>
          </div>
        ) : state?.closed ? (
          <p class="hunt-msg" aria-live="polite">{t(lang, 'hunt.closed', { month })}</p>
        ) : claiming ? (
          <form class="answer claim" onSubmit={claim}>
            <label class="sr" for="hunt-name">{t(lang, 'hunt.nameLabel')}</label>
            <input id="hunt-name" ref={input} type="text" autocomplete="name" maxLength={60} placeholder={t(lang, 'hunt.namePlaceholder')} value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} aria-invalid={!!err} />
            <button class="btn" type="submit" disabled={!state}>{t(lang, 'hunt.claim')}</button>
            <p class="hunt-msg" aria-live="polite">{err ?? t(lang, 'hunt.foundLead')}</p>
          </form>
        ) : (
          <div class="hunt-found">
            <button type="button" class="btn found" onClick={() => setClaiming(true)} disabled={!state}>
              {t(lang, 'hunt.found')}
            </button>
            <p class="hunt-msg">{t(lang, 'hunt.foundHint')}</p>
          </div>
        )}
        <div class="hunt-stats">
          <div>
            <b>{unlocked}</b>
            {t(lang, 'hunt.weekOf', { n: clues.length })}
          </div>
          <div>
            <b>{tp(lang, 'hunt.closesIn', daysLeft)}</b>
            {t(lang, 'hunt.untilClose')}
          </div>
        </div>
        <p class="hunt-foot">{t(lang, 'hunt.prize', { prize })}</p>
      </div>
      {clues[1]?.photo && (
        <div class={`clue fast-photo${unlocked >= 2 ? '' : ' locked'}`} aria-hidden={unlocked < 2}>
          <img src={clues[1].photo.src} alt={clues[1].photo.alt} width={900} height={675} loading="lazy" />
          {unlocked < 2 && <span class="clue-lock">{t(lang, 'hunt.clue', { k: 2 })}</span>}
        </div>
      )}
    </div>
  );
}

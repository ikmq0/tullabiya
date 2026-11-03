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

/** The Month's Hunt: the answer box up front; clues, seats and the prize one tap away.
 *  A wrong answer shakes once (320ms); a right one reveals the code. */
export default function HuntBlock({ lang, issue, huntId, month, clues, prize }: Props) {
  const profileStore = useStore($profile);
  const mounted = useMounted();
  const profile = mounted ? profileStore : null;
  const [state, setState] = useState<HuntState | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [value, setValue] = useState('');
  const [shaking, setShaking] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    hydrate(issue);
    getApi().getHunt(huntId).then(setState);
  }, [huntId, issue]);

  const daysLeft = state ? Math.max(0, Math.ceil((new Date(state.closesAt).getTime() - now()) / 86_400_000)) : 0;

  async function submit(e: Event) {
    e.preventDefault();
    const r = await getApi().submitHuntAnswer(huntId, value);
    setState(r.state);
    if (r.reason !== 'empty') await markProgress(issue, { huntAttempted: true });
    if (r.ok) {
      setMsg({ text: t(lang, 'hunt.right', { code: r.state.solved?.code ?? '' }), ok: true });
      setValue('');
      return;
    }
    const key = r.reason === 'closed' ? 'hunt.closed' : r.reason === 'rate-limited' ? 'hunt.rateLimited' : r.reason === 'empty' ? 'hunt.empty' : 'hunt.wrong';
    setMsg({ text: t(lang, key, { month }) });
    if (r.reason === 'wrong') {
      setShaking(true);
      setTimeout(() => setShaking(false), 340);
      input.current?.select();
    }
  }

  const solved = state?.solved;
  const unlocked = state?.clueIndex ?? 1;

  return (
    <div>
      {solved ? (
        <div class="hunt-msg ok" aria-live="polite">
          <p>{t(lang, solved.seat === 'first' ? 'hunt.seat.first' : solved.seat === 'draw' ? 'hunt.seat.draw' : 'hunt.seat.none', { rank: solved.rank ?? '' })}</p>
          <p>{t(lang, 'hunt.code')}</p>
          <span class="hunt-code" data-code>{solved.code}</span>
          <p>{t(lang, 'hunt.codeHint')}</p>
        </div>
      ) : state?.closed ? (
        <p class="hunt-msg" aria-live="polite">{t(lang, 'hunt.closed', { month })}</p>
      ) : (
        <>
          <form class="answer" onSubmit={submit}>
            <label class="sr" for="hunt-answer">{t(lang, 'hunt.answerLabel')}</label>
            <input
              id="hunt-answer"
              ref={input}
              class={shaking ? 'shake' : undefined}
              type="text"
              autocomplete="off"
              placeholder={t(lang, 'hunt.placeholder')}
              value={value}
              onInput={(e) => setValue((e.currentTarget as HTMLInputElement).value)}
              disabled={!state || state.attemptsLeft === 0}
            />
            <button class="btn" type="submit" disabled={!state || state.attemptsLeft === 0}>{t(lang, 'hunt.send')}</button>
          </form>
          <p class="hunt-msg" aria-live="polite">{msg?.text ?? ''}</p>
        </>
      )}
      <details class="hunt-more">
        <summary>{t(lang, 'hunt.more')}</summary>
        <div class="hunt-grid">
          <div>
            <div class="hunt-prog">
              <span>{t(lang, 'hunt.progress', { k: unlocked, n: clues.length, address: profile?.address ?? 'neutral' })}</span>
              <span class="pbars sm" aria-hidden="true">
                {clues.map((_, i) => (
                  <i key={i} class={`fast-bar${i < unlocked ? ' on' : ''}`} />
                ))}
              </span>
            </div>
            <ul class="menu" aria-label={t(lang, 'hunt.clue', { k: unlocked })}>
              {clues.slice(0, unlocked).map((c, i) => (
                <li key={i} class="pop-sub" style={{ padding: '4px 0', fontSize: 'var(--text-md)', color: 'inherit' }}>
                  {t(lang, 'hunt.clue', { k: i + 1 })}: {c.text}
                </li>
              ))}
            </ul>
            {state?.nextClueAt && !solved && !state.closed && (
              <p class="hunt-next" data-next-clue>{t(lang, 'hunt.nextClue', { k: unlocked + 1, date: formatDate(lang, state.nextClueAt) })}</p>
            )}
            <div class="hunt-stats">
              <div>
                <b>{state?.takenSeats ?? 0}</b>
                {t(lang, 'hunt.seatsFirst', { n: state?.firstSeats ?? 10 })}
              </div>
              <div>
                <b>{state?.drawSeats ?? 5}</b>
                {t(lang, 'hunt.seatsDraw')}
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
      </details>
    </div>
  );
}

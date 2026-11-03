import { useEffect, useState } from 'preact/hooks';
import { t, tp } from '~/i18n';
import type { Lang } from '~/lib/model';
import { getApi, type PollState } from '~/lib/api';
import { hydrate, markProgress } from '~/lib/store';

interface Props {
  lang: Lang;
  issue: number;
  pollId: string;
  options: { id: string; label: string }[];
  lead?: string;
}

/** Vote first, then the bars grow to the result (900ms ease-out). The numbers change when the reader
 *  votes or reloads, never by themselves. */
export default function PulsePoll({ lang, issue, pollId, options, lead }: Props) {
  const [state, setState] = useState<PollState | null>(null);

  useEffect(() => {
    hydrate(issue);
    getApi().getPoll(pollId).then(setState);
  }, [pollId, issue]);

  const voted = !!state?.myVote;

  async function vote(optionId: string) {
    if (voted) return;
    setState(await getApi().vote(pollId, optionId));
    await markProgress(issue, { voted: true });
  }

  const pct = (id: string) => state?.options.find((o) => o.id === id)?.pct ?? 0;
  const announce = voted ? options.map((o) => `${o.label} ${pct(o.id)}%`).join(lang === 'ar' ? '، ' : ', ') : '';

  return (
    <div>
      {lead && <p class="lead">{lead}</p>}
      <div class={`opts${voted ? ' voted' : ''}`} role="group" aria-label={t(lang, 'nav.pulse')}>
        {options.map((o, i) => {
          const p = pct(o.id);
          return (
            <button
              key={o.id}
              type="button"
              class={`opt fast-slab ${i === 0 ? 'a' : 'b'}${state?.myVote === o.id ? ' mine' : ''}`}
              disabled={voted || !state}
              aria-pressed={state?.myVote === o.id}
              onClick={() => vote(o.id)}
            >
              <span class="fill" style={{ '--p': voted ? p / 100 : 1 } as never} aria-hidden="true" />
              <span class="lab">{o.label}</span>
              <span class="pct" aria-hidden="true">{voted ? `${p}%` : ''}</span>
            </button>
          );
        })}
      </div>
      <p class="sr" aria-live="polite">{announce}</p>
      <p class="cmp" data-cmp>
        {voted && state && tp(lang, 'pulse.votes', state.total)}
        {!voted && t(lang, 'pulse.voteFirst')}
      </p>
    </div>
  );
}

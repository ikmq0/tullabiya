import { useEffect, useState } from 'preact/hooks';
import { t } from '~/i18n';
import type { Lang } from '~/lib/model';
import { fingerprint } from '~/lib/fingerprint';
import { getApi } from '~/lib/api';
import { issueState, type IssueState } from '~/lib/progress';
import { $profile, hydrate } from '~/lib/store';
import { useStore } from '@nanostores/preact';
import { useMounted } from '~/lib/useMounted';

interface Props {
  lang: Lang;
  issues: number[];
  currentIssue: number;
  /** Lit issues for the demo wall before the reader has history of their own. */
  demoLit?: number[];
  demoPartial?: number[];
  /** The "k of n completed" line; off where only some of the issues are shown. */
  note?: boolean;
}

/** Every issue as its own bar pattern; lit when the reader finished it. Server-rendered dim, states applied after hydration. */
export default function ArchiveWall({ lang, issues, currentIssue, demoLit = [], demoPartial = [], note = true }: Props) {
  const [states, setStates] = useState<Record<number, IssueState>>({});
  const profileStore = useStore($profile);
  const mounted = useMounted();
  const profile = mounted ? profileStore : null;
  useEffect(() => {
    let alive = true;
    hydrate(currentIssue);
    (async () => {
      const api = getApi();
      const out: Record<number, IssueState> = {};
      for (const n of issues) out[n] = issueState(await api.getProgress(n));
      if (alive) setStates(out);
    })();
    return () => {
      alive = false;
    };
  }, [issues.join(','), currentIssue]);

  const stateOf = (n: number): IssueState => {
    const own = states[n];
    if (own && own !== 'none') return own;
    if (demoLit.includes(n)) return 'complete';
    if (demoPartial.includes(n)) return 'partial';
    return own ?? 'none';
  };
  const label: Record<IssueState, string> = { complete: t(lang, 'arch.complete'), partial: t(lang, 'arch.partial'), none: t(lang, 'arch.unread') };
  const done = issues.filter((n) => stateOf(n) === 'complete').length;

  return (
    <>
      <div class="wall" aria-label={t(lang, 'arch.wall')}>
        {issues.map((n) => {
          const s = stateOf(n);
          return (
            <a key={n} href={`/${lang}/archive/${n}/`} class={`iss${s === 'complete' ? ' lit' : s === 'partial' ? ' part' : ''}`} aria-label={`${t(lang, 'arch.issue', { n })}: ${label[s]}`}>
              <span class="fp" aria-hidden="true">
                {fingerprint(n).map((h, i) => (
                  <i key={i} style={{ blockSize: `${h}%` }} />
                ))}
              </span>
              <b aria-hidden="true">{n}</b>
              <small aria-hidden="true">{label[s]}</small>
            </a>
          );
        })}
      </div>
      {note && <p class="arch-note">{t(lang, 'arch.note', { k: done, n: issues.length, address: profile?.address ?? 'neutral' })}</p>}
    </>
  );
}

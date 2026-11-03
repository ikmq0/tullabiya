import { useEffect, useState } from 'preact/hooks';
import { t } from '~/i18n';
import { getApi } from '~/lib/api';
import { latin } from '~/lib/latin';
import type { Address, Lang, SectionId } from '~/lib/model';
import { displayName } from '~/lib/name';

export interface EndGroup {
  id: SectionId;
  name: string;
  stories: { href: string; title: string; minutes: string }[];
}

interface Props {
  lang: Lang;
  issue: number;
  groups: EndGroup[];
}

/** What the issue held, section by section. The list is plain without JavaScript; with it, the sections this
 *  reader finished are marked. It reads this issue's own progress, and says nothing when there is none. */
export default function EndContents({ lang, issue, groups }: Props) {
  const [read, setRead] = useState<ReadonlySet<string>>(new Set());
  const [who, setWho] = useState<{ name: string; address: Address } | null>(null);
  useEffect(() => {
    void Promise.all([getApi().getProgress(issue), getApi().getProfile()]).then(([progress, profile]) => {
      setRead(new Set(progress.sectionsRead));
      if (profile) setWho({ name: displayName(profile.name), address: profile.address });
    });
  }, [issue]);
  const k = groups.filter((g) => read.has(g.id)).length;
  const n = groups.length;
  const line =
    k === 0
      ? null
      : k < n
        ? t(lang, 'favs.progress', { k, n, address: who?.address ?? 'neutral' })
        : who
          ? t(lang, 'end.caughtUp', { name: who.name, address: who.address })
          : t(lang, 'end.caughtUpAnon');
  return (
    <div class="end-list">
      {line && <p class="end-line">{line}</p>}
      {groups.map((g) => (
        <section class="reader-sec" key={g.id} aria-labelledby={`end-${g.id}`} data-read={read.has(g.id) ? 'true' : undefined}>
          <header class="reader-sec-head">
            <h2 id={`end-${g.id}`}>{g.name}</h2>
            {read.has(g.id) && <small class="end-read">{t(lang, 'read.sectionRead')}</small>}
          </header>
          <ul class="reader-rows">
            {g.stories.map((s) => (
              <li key={s.href} class="reader-row">
                <a class="reader-row-main" href={s.href}>
                  <span class="reader-row-title">{latin(s.title)}</span>
                  <small>{s.minutes}</small>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

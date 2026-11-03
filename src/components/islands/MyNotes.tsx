import { useEffect, useState } from 'preact/hooks';
import { t } from '~/i18n';
import { getApi, type PageMark } from '~/lib/api';
import type { Lang } from '~/lib/model';
import { groupMarks, markHref } from '~/lib/notes';
import { MarkCrop } from './NoteSheet';

/** The reader's marks by issue and page, each a crop of the page plus its comment, linking back. */
export default function MyNotes({ lang }: { lang: Lang }) {
  const [marks, setMarks] = useState<PageMark[] | null>(null);
  useEffect(() => {
    void getApi().listMarks().then(setMarks);
  }, []);
  if (!marks) return <p class="pop-sub">{t(lang, 'common.loading')}</p>;
  if (marks.length === 0) return <p class="empty" data-notes-empty>{t(lang, 'notes.empty')}</p>;
  return (
    <div class="my-notes" data-count={marks.length}>
      <p class="pop-sub">{t(lang, 'notes.privateShort')}</p>
      {groupMarks(marks).map((g) => (
        <section key={g.issue} class="my-notes-issue">
          <h3>{t(lang, 'arch.issue', { n: g.issue })}</h3>
          {g.pages.map((p) => (
            <div key={p.page} class="my-notes-page">
              <h4>{t(lang, 'arch.page', { k: p.page, n: '' }).replace(/\s*\S*\s*$/, '')}</h4>
              <ul>
                {p.marks.map((m) => (
                  <li key={m.id}>
                    <a class="my-note" href={markHref(lang, m)} aria-label={t(lang, 'notes.markOnPage', { n: p.page })}>
                      <MarkCrop base={`/archive/${m.issue}/`} mark={m} />
                    </a>
                    {m.comment && <p class="my-notes-comment">{m.comment}</p>}
                    {m.sentId && <small>{t(lang, 'common.pendingRef', { id: m.sentId })}</small>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

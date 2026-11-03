import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '~/i18n';
import { getApi, type PageMark } from '~/lib/api';
import type { Lang } from '~/lib/model';
import { COMMENT_MAX } from '~/lib/notes';
import { boundsOf, cropStyle, PAGE_ASPECT, padRect } from '~/lib/pageLayout';

/** A mark shown as a crop of the page itself: the PDFs' extracted text is damaged and never shown. */
export function MarkCrop({ base, mark }: { base: string; mark: Pick<PageMark, 'page' | 'rects'> }) {
  const src = `${base}p${String(mark.page).padStart(2, '0')}.jpg`;
  const r = padRect(boundsOf(mark.rects), 0.01);
  return <span class="mark-crop" aria-hidden="true" style={{ ...cropStyle(src, r), aspectRatio: `${r.w * PAGE_ASPECT} / ${r.h}` }} />;
}

interface Props {
  lang: Lang;
  base: string;
  note: PageMark;
  onChange: (note: PageMark | null) => void;
  onClose: () => void;
}

/** One mark and its comment: edit, delete, or send to the editors. Opened only by the reader. */
export default function NoteSheet({ lang, base, note, onChange, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(note.comment);
  const [sentId, setSentId] = useState(note.sentId);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function persist(): Promise<PageMark> {
    const next = await getApi().updateMark(note.id, { comment: text });
    setText(next.comment);
    onChange(next);
    return next;
  }
  async function save() {
    await persist();
    dialog.current?.close();
  }
  async function remove() {
    await getApi().deleteMark(note.id);
    onChange(null);
    dialog.current?.close();
  }
  async function send() {
    const next = await persist();
    if (!next.comment) return;
    const sub = await getApi().submitUserContent('comment', next.comment, `issue-${next.issue}-page-${next.page}`);
    onChange(await getApi().updateMark(note.id, { sentId: sub.id }));
    setSentId(sub.id);
    dispatchEvent(new Event('tullabiya:submitted'));
  }

  return (
    <dialog ref={dialog} class="rd-sheet note-sheet" aria-label={t(lang, 'notes.markOnPage', { n: note.page })} onClose={onClose}>
      <header class="rd-sheet-head">
        <h2>{t(lang, 'notes.markOnPage', { n: note.page })}</h2>
        <button type="button" class="rd-btn" onClick={() => dialog.current?.close()} aria-label={t(lang, 'common.close')}>
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <MarkCrop base={base} mark={note} />
      <label class="note-label" for="note-text">{t(lang, 'notes.comment')}</label>
      <textarea
        id="note-text"
        class="field note-field"
        rows={3}
        maxLength={COMMENT_MAX}
        value={text}
        onInput={(e) => setText(e.currentTarget.value)}
      />
      <p class="note-private">{t(lang, 'notes.private')}</p>
      <div class="note-acts">
        <button type="button" class="btn sm" onClick={save}>{t(lang, 'common.save')}</button>
        <button type="button" class="btn sm ghost" onClick={remove}>{t(lang, 'notes.delete')}</button>
      </div>
      {sentId ? (
        <p class="note-sent" data-sent>{t(lang, 'common.pendingRef', { id: sentId })}</p>
      ) : (
        <button type="button" class="btn sm ghost note-send" onClick={send} disabled={!text.trim()}>{t(lang, 'notes.send')}</button>
      )}
    </dialog>
  );
}

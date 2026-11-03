import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '~/i18n';
import { getApi, type PageMark } from '~/lib/api';
import { readJson, safeStorage, writeJson } from '~/lib/api/storage';
import { MAX_ZOOM, type Point, type Rect } from '~/lib/gesture';
import { latin } from '~/lib/latin';
import type { Lang, SectionId } from '~/lib/model';
import { parseLayout, placeInPage, snapMark, type PageLayout } from '~/lib/pageLayout';
import { continueOffer, firstPrinted, parsePageLink, parseStoryLink, visiblePages } from '~/lib/reader';
import LangSwitch from './LangSwitch';
import NoteSheet, { MarkCrop } from './NoteSheet';
import PagePhotos from './PagePhotos';
import PageViewer, { type ViewerHandle } from './PageViewer';

export interface OutlineStory {
  id: string;
  title: string;
  page: number | null;
  region: Rect | null;
  /** Only a story with no printed page has one: it is the one link that leaves the reader. */
  webHref: string | null;
}
export interface OutlineSection {
  id: SectionId;
  name: string;
  stories: OutlineStory[];
}
export interface PageGroupInfo {
  section: SectionId | null;
  label: string | null;
  pages: number[];
}

interface Props {
  lang: Lang;
  issue: number;
  pages: number;
  base: string;
  title: string;
  homeHref: string;
  endHref: string;
  hardHref: string;
  prevIssue: { href: string; label: string } | null;
  nextIssue: { href: string; label: string } | null;
  outline: OutlineSection[];
  groups: PageGroupInfo[];
}

type PanelName = 'contents' | 'pages' | 'notes' | 'more';

const WIDE = '(min-width: 1024px)';
const DOCK_KEY = 'tullabiya:v1:reader-dock';
const name = (p: number) => String(p).padStart(2, '0');

const ICONS = {
  back: 'M9 5l7 7-7 7',
  next: 'M15 5l-7 7 7 7',
  contents: 'M4 6h16M4 12h16M4 18h10',
  pages: 'M4 4h7v9H4zM13 4h7v9h-7zM4 15h16v5H4z',
  mark: 'M4 20h6M14 4l6 6-9 9H6v-5z',
  notes: 'M4 5h16v11H9l-5 4z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M5 12h14M12 5v14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
};
const Icon = ({ k, flip }: { k: keyof typeof ICONS; flip?: boolean }) => (
  <svg class={flip ? 'flip' : undefined} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={ICONS[k]} />
  </svg>
);

/** On a phone: a dialog that slides up from the bottom. */
function Sheet({ title, lang, onClose, children }: { title: string; lang: Lang; onClose: () => void; children: ComponentChildren }) {
  const el = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (el.current && !el.current.open) el.current.showModal();
  }, []);
  return (
    <dialog ref={el} class="rd-sheet" aria-label={title} onClose={onClose}>
      <header class="rd-sheet-head">
        <h2>{title}</h2>
        <button type="button" class="rd-btn" onClick={() => el.current?.close()} aria-label={t(lang, 'common.close')}>
          <Icon k="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}

/** The magazine as a full-screen reader: the printed pages, its own controls, and nothing of the site. On a phone
 *  a tap on the page hides or shows the bars. On a laptop the tools sit in a rail on the side the language starts
 *  from, with Contents docked beside it like a PDF reader's outline. */
export default function ReaderApp({ lang, issue, pages, base, title, homeHref, endHref, hardHref, prevIssue, nextIssue, outline, groups }: Props) {
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(1);
  const [story, setStory] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [barsOff, setBarsOff] = useState(false);
  const [panel, setPanel] = useState<PanelName | null>(null);
  const [offer, setOffer] = useState<{ page: number; storyId?: string } | null>(null);
  const [marking, setMarking] = useState(false);
  const [marks, setMarks] = useState<PageMark[]>([]);
  const [editing, setEditing] = useState<PageMark | null>(null);
  const [layouts, setLayouts] = useState<Record<number, PageLayout | null>>({});
  const [photo, setPhoto] = useState<{ page: number; index: number } | null>(null);
  const [typed, setTyped] = useState('');
  const viewer = useRef<ViewerHandle | null>(null);
  const appEl = useRef<HTMLDivElement>(null);
  const topEl = useRef<HTMLElement>(null);
  const dockEl = useRef<HTMLElement>(null);
  const asked = useRef(new Set<number>());
  const goingTo = useRef<{ page: number; id: string } | null>(null);
  const opening = useRef<OutlineStory | null>(null);
  const layoutsRef = useRef(layouts);
  layoutsRef.current = layouts;
  const marksRef = useRef(marks);
  marksRef.current = marks;

  const allStories = outline.flatMap((s) => s.stories);
  const visible = visiblePages(pages, page, wide);
  const rtl = lang === 'ar';
  const storySection = story ? outline.find((s) => s.stories.some((x) => x.id === story))?.id ?? null : null;
  const hereSection = storySection ?? groups.find((g) => g.pages.includes(page))?.section ?? null;
  const hereName = outline.find((s) => s.id === hereSection)?.name ?? null;
  const isCurrent = (s: OutlineStory) => (story ? s.id === story : s.page !== null && visible.includes(s.page));

  useEffect(() => {
    const linkPage = parsePageLink(location.search, location.hash, pages);
    const linkStory = parseStoryLink(location.search, allStories);
    const target = linkStory?.page ?? linkPage;
    if (target) {
      setPage(target);
      if (linkStory?.page) {
        setStory(linkStory.id);
        opening.current = linkStory;
      }
      void getApi().saveReaderPosition(issue, target, linkStory?.page ? linkStory.id : undefined);
    } else {
      void getApi().getReaderPosition(issue).then((saved) => {
        const p = continueOffer(saved, pages);
        if (p) setOffer({ page: p, storyId: saved?.storyId });
      });
    }
    void getApi().listMarks(issue).then(setMarks);
    const mq = matchMedia(WIDE);
    const sync = () => {
      setWide(mq.matches);
      if (mq.matches) {
        if (readJson(safeStorage(), DOCK_KEY, true)) setPanel((v) => v ?? 'contents');
      } else {
        setPanel(null);
      }
    };
    sync();
    mq.addEventListener('change', sync);
    setReady(true);
    // A trackpad pinch over the rail or panel must not zoom the browser's page instead.
    const el = appEl.current;
    const noPageZoom = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    addEventListener('wheel', noPageZoom, { passive: false });
    return () => {
      mq.removeEventListener('change', sync);
      removeEventListener('wheel', noPageZoom);
      void el;
    };
  }, []);

  // A deep link to a story: straight to its place, as soon as the page is laid out.
  useEffect(() => {
    if (!ready || !opening.current) return;
    const s = opening.current;
    opening.current = null;
    requestAnimationFrame(() => {
      if (s.page) viewer.current?.focus(s.page, s.region, topInset());
    });
  }, [ready]);

  // A page's layout loads when the page is shown. Without one there are no photo areas and marks are free.
  useEffect(() => {
    if (!ready) return;
    for (const n of visible) {
      if (asked.current.has(n)) continue;
      asked.current.add(n);
      fetch(`${base}l${name(n)}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((json) => setLayouts((all) => ({ ...all, [n]: parseLayout(json) })));
    }
  }, [ready, visible.join('-')]);

  // The docked outline keeps the reader's place in view as pages turn.
  useEffect(() => {
    dockEl.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [page, story, panel]);

  function topInset() {
    return !wide && !barsOff ? topEl.current?.offsetHeight ?? 0 : 0;
  }
  function turned(n: number) {
    const going = goingTo.current;
    goingTo.current = null;
    const id = going && going.page === n ? going.id : null;
    setPage(n);
    setOffer(null);
    setStory(id);
    history.replaceState(history.state, '', `?p=${n}${id ? `&s=${encodeURIComponent(id)}` : ''}`);
    void getApi().saveReaderPosition(issue, n, id ?? undefined);
  }
  function closeOnPhone() {
    if (!wide) setPanel(null);
  }
  function go(n: number) {
    closeOnPhone();
    setOffer(null);
    if (visible.includes(n)) viewer.current?.resetZoom();
    else viewer.current?.jump(n);
  }
  /** Goes to a story's place in the file and fits it to the screen. */
  function goStory(s: OutlineStory) {
    if (s.page === null) return;
    closeOnPhone();
    setOffer(null);
    setStory(s.id);
    goingTo.current = { page: s.page, id: s.id };
    if (visible.includes(s.page)) {
      goingTo.current = null;
      history.replaceState(history.state, '', `?p=${s.page}&s=${encodeURIComponent(s.id)}`);
      void getApi().saveReaderPosition(issue, s.page, s.id);
    }
    viewer.current?.focus(s.page, s.region, topInset());
  }
  const pageLink = (n: number) => ({
    href: `?p=${n}`,
    onClick: (e: MouseEvent) => {
      e.preventDefault();
      go(n);
    },
  });
  const storyLink = (s: OutlineStory) => ({
    href: `?p=${s.page}&s=${encodeURIComponent(s.id)}`,
    onClick: (e: MouseEvent) => {
      e.preventDefault();
      goStory(s);
    },
  });
  function togglePanel(which: PanelName) {
    const next = panel === which ? null : which;
    if (wide) {
      viewer.current?.resetZoom();
      if (which === 'contents' || next === null) writeJson(safeStorage(), DOCK_KEY, next !== null);
    }
    setPanel(next);
  }

  function tapped(target: Element) {
    const markId = target.closest<HTMLElement>('[data-mark]')?.dataset.mark;
    if (markId) {
      setEditing(marksRef.current.find((m) => m.id === markId) ?? null);
      return;
    }
    const pic = target.closest<HTMLElement>('[data-photo-page]');
    if (pic && !marking) {
      setPhoto({ page: Number(pic.dataset.photoPage), index: Number(pic.dataset.photoIndex) });
      return;
    }
    if (!marking && !wide) setBarsOff((off) => !off);
  }
  async function drawn(p: number, rects: Rect[]) {
    const m = await getApi().addMark(issue, p, rects);
    setMarks((all) => [...all, m]);
  }
  function changed(id: string, next: PageMark | null) {
    setMarks((all) => (next ? all.map((m) => (m.id === id ? next : m)) : all.filter((m) => m.id !== id)));
  }

  if (!ready) return <div class="rd-app" aria-hidden="true" />;

  const count = visible.length === 2 ? t(lang, 'read.spread', { a: visible[0], b: visible[1], n: pages }) : t(lang, 'arch.page', { k: page, n: pages });
  const atStart = page === 1;
  const atEnd = visible[visible.length - 1] === pages;
  const sorted = [...marks].sort((a, b) => a.page - b.page);
  const hereStories = allStories.filter((s) => s.page !== null && visible.includes(s.page));

  const prevButton = (
    <button type="button" class="rd-btn" onClick={() => viewer.current?.step(-1)} disabled={atStart} aria-label={t(lang, 'arch.prevPage')}>
      <Icon k="back" flip={!rtl} />
    </button>
  );
  const nextButton = atEnd ? (
    <a class="rd-btn" data-to-end href={endHref} aria-label={t(lang, 'read.toEnd')}>
      <Icon k="next" flip={!rtl} />
    </a>
  ) : (
    <button type="button" class="rd-btn" onClick={() => viewer.current?.step(1)} aria-label={t(lang, 'arch.nextPage')}>
      <Icon k="next" flip={!rtl} />
    </button>
  );
  const zoomOut = (
    <button type="button" class="rd-btn" onClick={() => viewer.current?.zoomBy(-1)} disabled={zoom <= 1} aria-label={t(lang, 'read.zoomOut')}>
      <Icon k="minus" />
    </button>
  );
  const zoomIn = (
    <button type="button" class="rd-btn" onClick={() => viewer.current?.zoomBy(1)} disabled={zoom >= MAX_ZOOM} aria-label={t(lang, 'read.zoomIn')}>
      <Icon k="plus" />
    </button>
  );
  const backLink = (
    <a class="rd-btn" href={homeHref} aria-label={t(lang, 'rd.backToSite')}>
      <Icon k="back" flip={!rtl} />
    </a>
  );
  const tool = (which: PanelName, icon: keyof typeof ICONS, label: string) => (
    <button type="button" class="rd-tool" data-tool={which} aria-expanded={panel === which ? 'true' : 'false'} onClick={() => togglePanel(which)}>
      <Icon k={icon} />
      <span>{label}</span>
    </button>
  );
  const tools = (
    <>
      {tool('contents', 'contents', t(lang, 'rd.contents'))}
      {tool('pages', 'pages', t(lang, 'read.pages'))}
      <button type="button" class="rd-tool" data-tool="mark" aria-pressed={marking ? 'true' : 'false'} onClick={() => setMarking((m) => !m)}>
        <Icon k="mark" />
        <span>{t(lang, 'notes.highlight')}</span>
      </button>
      {tool('notes', 'notes', t(lang, 'rd.notes'))}
      {tool('more', 'more', t(lang, 'rd.more'))}
    </>
  );
  const thumbs = <Thumbs lang={lang} base={base} pages={pages} groups={groups} visible={visible} pageLink={pageLink} />;

  const panelTitle = panel === 'contents' ? t(lang, 'rd.contents') : panel === 'pages' ? t(lang, 'read.pages') : panel === 'notes' ? t(lang, 'notes.title') : t(lang, 'rd.more');
  const panelBody =
    panel === 'contents' ? (
      outline.length > 0 ? (
        <>
          {hereStories.length > 0 && (
            <section class="rd-here">
              <h3>{t(lang, visible.length === 2 ? 'read.onPages' : 'read.onPage')}</h3>
              <ul>
                {hereStories.map((s) => (
                  <li key={s.id} class="rd-row">
                    <a class="rd-row-title" {...storyLink(s)}><span>{latin(s.title)}</span></a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {outline.map((sec) => {
            const first = firstPrinted(sec.stories);
            return (
              <section key={sec.id} class="rd-sec" data-here={sec.id === hereSection ? 'true' : undefined}>
                <h3>{first ? <a {...storyLink(first)}>{sec.name}</a> : sec.name}</h3>
                <ul>
                  {sec.stories.map((s) => (
                    <li key={s.id} class="rd-row" data-current={isCurrent(s) ? 'true' : undefined}>
                      {s.page !== null ? (
                        <a class="rd-row-title" aria-current={isCurrent(s) ? 'true' : undefined} {...storyLink(s)}>
                          <span>{latin(s.title)}</span>
                          <small>{t(lang, 'read.pageShort', { n: s.page })}</small>
                        </a>
                      ) : (
                        <a class="rd-row-title" href={s.webHref ?? undefined}>
                          <span>{latin(s.title)}</span>
                          <small>{t(lang, 'read.webOnly')}</small>
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      ) : (
        thumbs
      )
    ) : panel === 'pages' ? (
      <>
        <form
          class="rd-jump"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(typed);
            if (Number.isInteger(n) && n >= 1 && n <= pages) go(n);
          }}
        >
          <label for="rd-jump">{t(lang, 'rd.jump')}</label>
          <input id="rd-jump" class="field" type="number" inputMode="numeric" min={1} max={pages} value={typed} onInput={(e) => setTyped(e.currentTarget.value)} />
          <button type="submit" class="btn sm">{t(lang, 'rd.go')}</button>
        </form>
        {thumbs}
      </>
    ) : panel === 'notes' ? (
      sorted.length === 0 ? (
        <p class="rd-empty" data-notes-empty>{t(lang, 'notes.emptyIssue')}</p>
      ) : (
        <>
          <p class="rd-private">{t(lang, 'notes.privateShort')}</p>
          <ul class="rd-notes">
            {sorted.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  class="rd-note"
                  onClick={() => {
                    closeOnPhone();
                    if (!visible.includes(m.page)) viewer.current?.jump(m.page);
                    setEditing(m);
                  }}
                >
                  <MarkCrop base={base} mark={m} />
                  <span>
                    <small>{t(lang, 'read.pageShort', { n: m.page })}</small>
                    {m.comment && <b>{m.comment}</b>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )
    ) : panel === 'more' ? (
      <ul class="rd-more">
        <li><a href={`${base}issue.pdf`} download>{t(lang, 'arch.download')}</a></li>
        <li><a href={hardHref}>{t(lang, 'hard.title')}</a></li>
        <li><a href={endHref}>{t(lang, 'read.toEnd')}</a></li>
        {prevIssue && <li><a href={prevIssue.href} rel="prev">{t(lang, 'read.prevIssue')}: {prevIssue.label}</a></li>}
        {nextIssue && <li><a href={nextIssue.href} rel="next">{t(lang, 'read.nextIssue')}: {nextIssue.label}</a></li>}
        <li><a href={homeHref}>{t(lang, 'rd.backToSite')}</a></li>
        <li class="rd-more-lang"><LangSwitch lang={lang} pathname={`/${lang}/read/${issue}/`} /></li>
      </ul>
    ) : null;

  return (
    <div ref={appEl} class="rd-app" data-layout={wide ? 'wide' : 'phone'} data-bars={barsOff ? 'off' : undefined} data-marking={marking ? 'true' : undefined} data-panel={wide && panel ? 'open' : undefined}>
      {wide && (
        <nav class="rd-rail" aria-label={t(lang, 'read.controls')}>
          {backLink}
          <div class="rd-title rd-rail-title">
            <h1>{title}</h1>
            <p class="rd-count" aria-live="polite">{count}</p>
          </div>
          <div class="rd-rail-tools">{tools}</div>
          <span class="rd-gap" />
          <div class="rd-rail-group">
            {zoomIn}
            {zoomOut}
          </div>
          <div class="rd-rail-group">
            {prevButton}
            {nextButton}
          </div>
        </nav>
      )}
      {wide && panel && (
        <aside ref={dockEl} class="rd-dock" aria-label={panelTitle}>
          <header class="rd-sheet-head">
            <h2>{panelTitle}</h2>
            <button type="button" class="rd-btn" onClick={() => togglePanel(panel)} aria-label={t(lang, 'rd.hidePanel')}>
              <Icon k="close" />
            </button>
          </header>
          {panelBody}
        </aside>
      )}

      <PageViewer
        lang={lang}
        issue={issue}
        pages={pages}
        base={base}
        page={page}
        onPage={turned}
        reader
        wide={wide}
        handle={viewer}
        endHref={endHref}
        onZoom={setZoom}
        onTap={tapped}
        marking={marking}
        snap={(p: number, a: Point, b: Point) => snapMark(layoutsRef.current[p] ?? null, a, b)}
        onMarkDrawn={drawn}
        photosOf={(n) => (layoutsRef.current[n]?.images ?? []).flatMap((im) => (im.file && !im.tilt ? [{ src: base + im.file, rect: im.rect, rot: im.rot ?? 0 }] : []))}
        overlay={(n) => (
          <>
            {!marking &&
              layouts[n]?.images.map((im, i) => (
                <button
                  key={i}
                  type="button"
                  class="page-photo"
                  data-photo-page={n}
                  data-photo-index={i}
                  style={placeInPage(im.rect)}
                  aria-label={t(lang, 'rd.photoOn', { k: i + 1, n })}
                  onClick={(e) => {
                    // A tap reaches this through the stage; a keyboard press through its own click.
                    if (e.detail === 0) setPhoto({ page: n, index: i });
                  }}
                />
              ))}
            {marks
              .filter((m) => m.page === n)
              .flatMap((m) =>
                m.rects.map((r, i) =>
                  i === 0 ? (
                    <button
                      key={m.id}
                      type="button"
                      class="page-mark"
                      data-mark={m.id}
                      style={placeInPage(r)}
                      aria-label={t(lang, 'notes.openMark', { n })}
                      onClick={(e) => {
                        if (e.detail === 0) setEditing(m);
                      }}
                    />
                  ) : (
                    <span key={`${m.id}-${i}`} class="page-mark" data-mark={m.id} style={placeInPage(r)} />
                  ),
                ),
              )}
          </>
        )}
      />

      {!wide && (
        <header ref={topEl} class="rd-top">
          {backLink}
          <div class="rd-title">
            <h1>{title}</h1>
            <p>
              <span class="rd-count" aria-live="polite">{count}</span>
              {hereName && <span class="rd-section"> · {hereName}</span>}
            </p>
          </div>
          {zoomOut}
          {zoomIn}
        </header>
      )}

      {marking && <p class="rd-hint" role="status">{t(lang, 'notes.markHint')}</p>}
      {offer !== null && !marking && (
        <p class="rd-continue">
          <a
            href={`?p=${offer.page}${offer.storyId ? `&s=${encodeURIComponent(offer.storyId)}` : ''}`}
            onClick={(e) => {
              e.preventDefault();
              const s = offer.storyId ? allStories.find((x) => x.id === offer.storyId) : null;
              if (s) goStory(s);
              else go(offer.page);
            }}
          >
            {t(lang, 'read.continueGo', { k: offer.page })}
          </a>
        </p>
      )}
      {zoom > 1 && !marking && (
        <button type="button" class="rd-whole" onClick={() => viewer.current?.resetZoom()}>{t(lang, 'rd.wholePage')}</button>
      )}

      {!wide && (
        <nav class="rd-bottom" aria-label={t(lang, 'read.controls')}>
          {prevButton}
          {tools}
          {nextButton}
        </nav>
      )}

      {!wide && panel && (
        <Sheet title={panelTitle} lang={lang} onClose={() => setPanel(null)}>
          {panelBody}
        </Sheet>
      )}

      {editing && <NoteSheet key={editing.id} lang={lang} base={base} note={editing} onChange={(next) => changed(editing.id, next)} onClose={() => setEditing(null)} />}

      {photo && (
        <PagePhotos
          lang={lang}
          base={base}
          page={photo.page}
          start={photo.index}
          photos={layouts[photo.page]?.images ?? []}
          stories={allStories.filter((s) => s.page === photo.page).map((s) => ({ id: s.id, title: s.title }))}
          onClose={() => setPhoto(null)}
          onGoStory={(id) => {
            const s = allStories.find((x) => x.id === id);
            if (s) goStory(s);
          }}
        />
      )}
    </div>
  );
}

function Thumbs({ lang, base, pages, groups, visible, pageLink }: { lang: Lang; base: string; pages: number; groups: PageGroupInfo[]; visible: number[]; pageLink: (n: number) => { href: string; onClick: (e: MouseEvent) => void } }) {
  return (
    <div class="rd-thumbs">
      {groups.map((g) => (
        <section key={g.pages[0]} class="rd-thumb-group" data-here={g.pages.some((p) => visible.includes(p)) ? 'true' : undefined}>
          {g.label && <h3>{g.label}</h3>}
          <ul>
            {g.pages.map((n) => (
              <li key={n}>
                <a class="rd-thumb" aria-current={visible.includes(n) ? 'true' : undefined} aria-label={t(lang, 'arch.page', { k: n, n: pages })} {...pageLink(n)}>
                  <img src={`${base}p${name(n)}.jpg`} alt="" width={92} height={130} loading="lazy" />
                  <span aria-hidden="true">{n}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

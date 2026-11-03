// The digital reader's logic: how an issue's stories, printed pages and neighbors connect.
// Pure on purpose, so pages and islands share it and the unit tests need no browser.
import type { ReaderPosition } from '~/lib/api/Api';
import { SECTION_IDS, type ArchiveEntry, type SectionId } from '~/lib/model';

/* ---------- Stories ---------- */

/** Stories by section, in the magazine's section order, keeping the given order within each. */
export function groupBySection<T extends { section: SectionId }>(stories: readonly T[]): { section: SectionId; stories: T[] }[] {
  return SECTION_IDS.map((section) => ({ section, stories: stories.filter((s) => s.section === section) })).filter((g) => g.stories.length > 0);
}

/** The stories printed on any of these pages. Web-only stories have no page and never appear. */
export function storiesOnPages<T extends { pdfPage?: number }>(stories: readonly T[], pages: readonly number[]): T[] {
  return stories.filter((s) => s.pdfPage !== undefined && pages.includes(s.pdfPage));
}

/** The neighbors of a story in reading order; `next` is null on the last story. */
export function adjacentStories<T extends { id: string }>(ordered: readonly T[], id: string): { prev: T | null; next: T | null } {
  const i = ordered.findIndex((s) => s.id === id);
  if (i < 0) return { prev: null, next: null };
  return { prev: ordered[i - 1] ?? null, next: ordered[i + 1] ?? null };
}

/* ---------- Issues ---------- */

/** The neighbors of an issue by number across the whole archive, whatever `currentIssue()` says. */
export function adjacentIssues(numbers: readonly number[], n: number): { prev: number | null; next: number | null } {
  const sorted = [...numbers].sort((a, b) => a - b);
  const i = sorted.indexOf(n);
  if (i < 0) return { prev: null, next: null };
  return { prev: sorted[i - 1] ?? null, next: sorted[i + 1] ?? null };
}

/** An issue has pages to read when its files are on disk. A fresh clone has only issue 21. */
export function hasPages(entry: Pick<ArchiveEntry, 'local' | 'pages'>): boolean {
  return !!entry.local && entry.pages > 0;
}

/** The Deanship's copy of an issue's PDF, for a clone that has not ingested the pages. */
export function remotePdfUrl(sources: { base: string; issues: Record<string, string> }, n: number): string | null {
  const file = sources.issues[String(n)];
  return file ? sources.base + encodeURIComponent(file) : null;
}

/* ---------- Printed pages ---------- */

/** The issue as it opens: the cover alone, then facing pages, and a last page alone when the count is even. */
export function spreads(pages: number): number[][] {
  if (pages < 1) return [];
  const out: number[][] = [[1]];
  for (let p = 2; p <= pages; p += 2) out.push(p < pages ? [p, p + 1] : [p]);
  return out;
}

/** The pages on screen when `page` is open. */
export function visiblePages(pages: number, page: number, wide: boolean): number[] {
  if (!wide) return [page];
  return spreads(pages).find((s) => s.includes(page)) ?? [page];
}

/** The page one step on (`1`) or back (`-1`), or null past either end of the issue. */
export function stepPage(pages: number, page: number, dir: 1 | -1, wide: boolean): number | null {
  if (!wide) {
    const n = page + dir;
    return n >= 1 && n <= pages ? n : null;
  }
  const all = spreads(pages);
  const i = all.findIndex((s) => s.includes(page));
  return all[i + dir]?.[0] ?? null;
}

/** The pages worth fetching ahead of time: the ones one step away. Never the whole issue. */
export function neighborPages(pages: number, page: number, wide: boolean): number[] {
  const out: number[] = [];
  for (const dir of [1, -1] as const) {
    const n = stepPage(pages, page, dir, wide);
    if (n !== null) out.push(...visiblePages(pages, n, wide));
  }
  return out;
}

export interface PageGroup {
  /** The section these pages belong to; null for pages no story says anything about. */
  section: SectionId | null;
  pages: number[];
}

/** Consecutive pages under the section of their first story, derived from each story's `pdfPage`. An issue
 *  without stories comes back as one plain sequence. */
export function groupPages(pages: number, stories: readonly { section: SectionId; pdfPage?: number }[]): PageGroup[] {
  const out: PageGroup[] = [];
  for (let p = 1; p <= pages; p++) {
    const section = stories.find((s) => s.pdfPage === p)?.section ?? null;
    const tail = out[out.length - 1];
    if (tail && tail.section === section) tail.pages.push(p);
    else out.push({ section, pages: [p] });
  }
  return out;
}

/* ---------- Links and position ---------- */

/** The page a reader link asks for, from its query (`?p=3`) or hash (`#p3`); null for none or one off the issue. */
export function parsePageLink(search: string, hash: string, pages: number): number | null {
  const raw = new URLSearchParams(search).get('p') ?? /^#p(\d+)$/.exec(hash)?.[1];
  if (!raw || !/^\d+$/.test(raw)) return null;
  const page = Number(raw);
  return page >= 1 && page <= pages ? page : null;
}

/** The link to a printed page, and to a story's place on it. The hash lands on the page's entry in the plain
 *  fallback when JavaScript is off. */
export function pageHref(lang: string, issue: number, page: number, storyId?: string): string {
  return `/${lang}/read/${issue}/?p=${page}${storyId ? `&s=${encodeURIComponent(storyId)}` : ''}#p${page}`;
}

/** The story a reader link asks for (`?s=21-musab`), if the issue has it. */
export function parseStoryLink<T extends { id: string }>(search: string, stories: readonly T[]): T | null {
  const id = new URLSearchParams(search).get('s');
  return (id && stories.find((s) => s.id === id)) || null;
}

/** The first story of a section that has a place in the file. */
export function firstPrinted<T extends { page: number | null }>(stories: readonly T[]): T | null {
  return stories.find((s) => s.page !== null) ?? null;
}

/** Which page to offer on return, or null when the cover is where the reader left off. */
export function continueOffer(saved: ReaderPosition | null, pages: number): number | null {
  if (!saved || saved.page <= 1 || saved.page > pages) return null;
  return saved.page;
}

/** The section a page belongs to, for marking the reader's place. */
export function sectionOfPage(groups: readonly PageGroup[], page: number): SectionId | null {
  return groups.find((g) => g.pages.includes(page))?.section ?? null;
}

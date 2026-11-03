// The reader's own marks on printed pages: limits and grouping for the lists.
import type { PageMark } from '~/lib/api/Api';

/** The longest comment. The same limit `submitUserContent('comment', ...)` applies, so sending loses nothing. */
export const COMMENT_MAX = 280;

export interface MarkGroup {
  issue: number;
  pages: { page: number; marks: PageMark[] }[];
}

/** By issue, newest issue first, then by page in order. */
export function groupMarks(list: readonly PageMark[]): MarkGroup[] {
  const issues = [...new Set(list.map((m) => m.issue))].sort((a, b) => b - a);
  return issues.map((issue) => {
    const mine = list.filter((m) => m.issue === issue);
    const pages = [...new Set(mine.map((m) => m.page))].sort((a, b) => a - b);
    return { issue, pages: pages.map((page) => ({ page, marks: mine.filter((m) => m.page === page) })) };
  });
}

/** The link back to a mark's page. */
export function markHref(lang: string, m: Pick<PageMark, 'issue' | 'page'>): string {
  return `/${lang}/read/${m.issue}/?p=${m.page}`;
}

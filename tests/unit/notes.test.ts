import { describe, expect, it } from 'vitest';
import type { PageMark } from '~/lib/api/Api';
import { groupMarks, markHref } from '~/lib/notes';

const mark = (id: string, issue: number, page: number): PageMark => ({ id, issue, page, rects: [{ x: 0, y: 0, w: 1, h: 1 }], comment: '', createdAt: '', updatedAt: '' });

describe('grouping marks', () => {
  it('goes by issue, newest first, then by page in order', () => {
    const groups = groupMarks([mark('a', 21, 5), mark('b', 21, 2), mark('c', 7, 1), mark('d', 21, 5)]);
    expect(groups.map((g) => g.issue)).toEqual([21, 7]);
    expect(groups[0].pages.map((p) => p.page)).toEqual([2, 5]);
    expect(groups[0].pages[1].marks.map((m) => m.id)).toEqual(['a', 'd']);
  });
  it('is empty with nothing to show', () => {
    expect(groupMarks([])).toEqual([]);
  });
  it('links back to the page', () => {
    expect(markHref('ar', mark('a', 21, 3))).toBe('/ar/read/21/?p=3');
  });
});

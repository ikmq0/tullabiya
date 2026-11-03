import { describe, expect, it } from 'vitest';
import { currentIssue, loadAll, storiesOf } from '~/data';
import {
  adjacentIssues, adjacentStories, continueOffer, firstPrinted, groupBySection, groupPages, hasPages, neighborPages, pageHref, parsePageLink, parseStoryLink,
  remotePdfUrl, sectionOfPage, spreads, stepPage, storiesOnPages, visiblePages,
} from '~/lib/reader';
import type { SectionId } from '~/lib/model';

const s = (id: string, section: SectionId, pdfPage?: number) => ({ id, section, pdfPage });

describe('stories', () => {
  it('groups by section in magazine order, keeping the given order within each', () => {
    const groups = groupBySection([s('b', 'last'), s('c', 'news'), s('a', 'last'), s('d', 'guest')]);
    expect(groups.map((g) => g.section)).toEqual(['news', 'guest', 'last']);
    expect(groups[2].stories.map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('finds the stories on a set of pages and never a web-only one', () => {
    const list = [s('a', 'news', 2), s('b', 'news'), s('c', 'news', 3)];
    expect(storiesOnPages(list, [3]).map((x) => x.id)).toEqual(['c']);
    expect(storiesOnPages(list, [2, 3]).map((x) => x.id)).toEqual(['a', 'c']);
    expect(storiesOnPages(list, [1])).toEqual([]);
  });
  it('knows the neighbors of a story and that the ends have none', () => {
    const list = [s('a', 'news'), s('b', 'news'), s('c', 'news')];
    expect(adjacentStories(list, 'b')).toMatchObject({ prev: { id: 'a' }, next: { id: 'c' } });
    expect(adjacentStories(list, 'a').prev).toBeNull();
    expect(adjacentStories(list, 'c').next).toBeNull();
    expect(adjacentStories(list, 'nope')).toEqual({ prev: null, next: null });
  });
});

describe('issues', () => {
  it('walks the archive by number, whatever order it is given', () => {
    expect(adjacentIssues([3, 1, 2], 2)).toEqual({ prev: 1, next: 3 });
    expect(adjacentIssues([1, 2, 3], 1)).toEqual({ prev: null, next: 2 });
    expect(adjacentIssues([1, 2, 3], 3)).toEqual({ prev: 2, next: null });
    expect(adjacentIssues([1, 2, 3], 9)).toEqual({ prev: null, next: null });
  });
  it('leads past the current issue when the archive holds a later one', () => {
    const numbers = loadAll().archive.map((a) => a.number);
    expect(currentIssue().number).toBe(21);
    expect(adjacentIssues(numbers, 21)).toEqual({ prev: 20, next: 22 });
    expect(adjacentIssues(numbers, 22).next).toBeNull();
    expect(adjacentIssues(numbers, 1).prev).toBeNull();
  });
  it('has pages to read only when the files are on disk', () => {
    expect(hasPages({ local: true, pages: 8 })).toBe(true);
    expect(hasPages({ local: false, pages: 8 })).toBe(false);
    expect(hasPages({ local: true, pages: 0 })).toBe(false);
  });
  it('builds the remote PDF link, encoded, and admits when it has none', () => {
    const sources = { base: 'https://x.test/', issues: { '4': 'الطلابية-4.pdf' } };
    expect(remotePdfUrl(sources, 4)).toBe(`https://x.test/${encodeURIComponent('الطلابية-4.pdf')}`);
    expect(remotePdfUrl(sources, 5)).toBeNull();
  });
});

describe('spreads', () => {
  it('opens with the cover alone, then facing pages', () => {
    expect(spreads(8)).toEqual([[1], [2, 3], [4, 5], [6, 7], [8]]);
    expect(spreads(7)).toEqual([[1], [2, 3], [4, 5], [6, 7]]);
    expect(spreads(1)).toEqual([[1]]);
    expect(spreads(2)).toEqual([[1], [2]]);
    expect(spreads(0)).toEqual([]);
  });
  it('holds every page exactly once, in order', () => {
    for (const n of [1, 2, 3, 8, 9, 40]) {
      expect(spreads(n).flat()).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });
  it('shows the facing page only on a wide screen', () => {
    expect(visiblePages(8, 3, false)).toEqual([3]);
    expect(visiblePages(8, 3, true)).toEqual([2, 3]);
    expect(visiblePages(8, 1, true)).toEqual([1]);
    expect(visiblePages(8, 8, true)).toEqual([8]);
  });
  it('steps one page on a phone and one spread on a wide screen, stopping at the ends', () => {
    expect(stepPage(8, 3, 1, false)).toBe(4);
    expect(stepPage(8, 3, -1, false)).toBe(2);
    expect(stepPage(8, 8, 1, false)).toBeNull();
    expect(stepPage(8, 1, -1, false)).toBeNull();
    expect(stepPage(8, 1, 1, true)).toBe(2);
    expect(stepPage(8, 3, 1, true)).toBe(4);
    expect(stepPage(8, 3, -1, true)).toBe(1);
    expect(stepPage(8, 8, 1, true)).toBeNull();
  });
  it('fetches ahead only the pages one step away', () => {
    expect(neighborPages(8, 3, false).sort()).toEqual([2, 4]);
    expect(neighborPages(8, 1, false)).toEqual([2]);
    expect(neighborPages(8, 3, true).sort()).toEqual([1, 4, 5]);
    expect(neighborPages(8, 8, true).sort()).toEqual([6, 7]);
  });
});

describe('pages by section', () => {
  it('groups consecutive pages under their first story, with unclaimed pages on their own', () => {
    const stories = [s('a', 'news', 2), s('b', 'news', 3), s('c', 'guest', 4), s('d', 'last', 6), s('e', 'news')];
    expect(groupPages(6, stories)).toEqual([
      { section: null, pages: [1] },
      { section: 'news', pages: [2, 3] },
      { section: 'guest', pages: [4] },
      { section: null, pages: [5] },
      { section: 'last', pages: [6] },
    ]);
  });
  it('gives a back issue without stories one plain sequence', () => {
    expect(groupPages(3, [])).toEqual([{ section: null, pages: [1, 2, 3] }]);
    expect(groupPages(0, [])).toEqual([]);
  });
  it('a page holding two sections sits under the first story in reading order', () => {
    expect(groupPages(1, [s('a', 'guest', 1), s('b', 'news', 1)])).toEqual([{ section: 'guest', pages: [1] }]);
  });
  it('splits issue 21 the way it was printed', () => {
    expect(groupPages(8, storiesOf(21)).map((g) => [g.section, g.pages])).toEqual([
      [null, [1]],
      ['news', [2, 3]],
      ['guest', [4]],
      ['experience', [5]],
      ['contributions', [6, 7]],
      ['last', [8]],
    ]);
  });
});

describe('links and position', () => {
  it('reads the page from the query or the hash', () => {
    expect(parsePageLink('?p=3', '', 8)).toBe(3);
    expect(parsePageLink('', '#p4', 8)).toBe(4);
    expect(parsePageLink('?p=3', '#p4', 8)).toBe(3);
    expect(parsePageLink('', '', 8)).toBeNull();
    expect(parsePageLink('', '#notes', 8)).toBeNull();
  });
  it('ignores a page off the issue or a value that is not one', () => {
    expect(parsePageLink('?p=99', '', 8)).toBeNull();
    expect(parsePageLink('?p=0', '', 8)).toBeNull();
    expect(parsePageLink('?p=2x', '', 8)).toBeNull();
    expect(parsePageLink('?p=-1', '', 8)).toBeNull();
  });
  it('builds the page link stories use, which also works in the plain fallback', () => {
    expect(pageHref('ar', 21, 5)).toBe('/ar/read/21/?p=5#p5');
    expect(pageHref('ar', 21, 5, '21-musab')).toBe('/ar/read/21/?p=5&s=21-musab#p5');
  });
  it('reads the story from the link, only if the issue has it', () => {
    const list = [{ id: 'a' }, { id: 'b' }];
    expect(parseStoryLink('?p=3&s=b', list)).toEqual({ id: 'b' });
    expect(parseStoryLink('?p=3&s=zzz', list)).toBeNull();
    expect(parseStoryLink('?p=3', list)).toBeNull();
  });
  it('a section goes to its first story with a place in the file', () => {
    expect(firstPrinted([{ id: 'w', page: null }, { id: 'a', page: 4 }, { id: 'b', page: 5 }])).toEqual({ id: 'a', page: 4 });
    expect(firstPrinted([{ page: null }])).toBeNull();
  });
  it('offers to continue only from a later page that exists', () => {
    expect(continueOffer(null, 8)).toBeNull();
    expect(continueOffer({ issue: 21, page: 1 }, 8)).toBeNull();
    expect(continueOffer({ issue: 21, page: 5 }, 8)).toBe(5);
    expect(continueOffer({ issue: 21, page: 99 }, 8)).toBeNull();
  });
  it('knows the section of a page', () => {
    const groups = groupPages(8, storiesOf(21));
    expect(sectionOfPage(groups, 1)).toBeNull();
    expect(sectionOfPage(groups, 3)).toBe('news');
    expect(sectionOfPage(groups, 7)).toBe('contributions');
    expect(sectionOfPage(groups, 99)).toBeNull();
  });
});

describe('issue 21 as published', () => {
  const stories = storiesOf(21);
  it('every printed page reference falls inside the issue, and one story is web only', () => {
    for (const x of stories) if (x.pdfPage) expect(x.pdfPage).toBeLessThanOrEqual(8);
    expect(stories.filter((x) => !x.pdfPage).map((x) => x.id)).toEqual(['21-research-day']);
  });
  it('page 3 lists its three stories in reading order, and the cover lists none', () => {
    expect(storiesOnPages(stories, [3]).map((x) => x.id)).toEqual(['21-murshid', '21-council', '21-formula']);
    expect(storiesOnPages(stories, [1])).toEqual([]);
  });
  it('the last story has no next one, which is where the end screen takes over', () => {
    const last = stories[stories.length - 1];
    expect(last.id).toBe('21-bcg');
    expect(adjacentStories(stories, last.id).next).toBeNull();
  });
});

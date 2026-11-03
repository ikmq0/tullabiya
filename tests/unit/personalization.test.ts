import { describe, it, expect } from 'vitest';
import { countForMe, isForMe, orderForYou } from '~/lib/personalization';
import type { SectionId } from '~/lib/model';

type Item = { id: string; section?: SectionId; unitId?: string; unitIds?: string[] };
const items: Item[] = [
  { id: 'a', section: 'news', unitIds: ['dsa'] },
  { id: 'b', section: 'news', unitIds: ['srt'] },
  { id: 'c', section: 'guest' },
  { id: 'd', section: 'experience', unitIds: ['mag'] },
  { id: 'e', unitId: 'srt' },
];
const none = { sections: [], units: [] };

describe('isForMe', () => {
  it('matches a followed publisher by unitId or unitIds, and a pinned section', () => {
    expect(isForMe({ unitId: 'srt' }, { sections: [], units: ['srt'] })).toBe(true);
    expect(isForMe({ unitIds: ['dsa', 'srt'] }, { sections: [], units: ['srt'] })).toBe(true);
    expect(isForMe({ section: 'guest' }, { sections: ['guest'], units: [] })).toBe(true);
    expect(isForMe({ section: 'guest', unitIds: ['dsa'] }, { sections: ['news'], units: ['srt'] })).toBe(false);
    expect(isForMe({ unitId: 'srt' }, none)).toBe(false);
  });
});

describe('orderForYou', () => {
  it('puts followed and pinned items first, keeping the original order inside each group', () => {
    const out = orderForYou(items, { sections: ['guest'], units: ['srt'] }).map((x) => x.id);
    expect(out).toEqual(['b', 'c', 'e', 'a', 'd']);
  });
  it('returns the input order with nothing followed', () => {
    expect(orderForYou(items, none).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('counts what is for me', () => {
    expect(countForMe(items, { sections: [], units: ['srt'] })).toBe(2);
  });
});

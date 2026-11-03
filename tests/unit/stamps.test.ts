import { describe, expect, it } from 'vitest';
import { dueStamps, levelOf, nextTier, TRACKS } from '~/lib/stamps';

const none = { issues: 0, votes: 0, hunts: 0, follows: 0, digests: 0, langs: 1 };

describe('milestones', () => {
  it('earns nothing from a fresh reader', () => {
    expect(dueStamps(none)).toEqual([]);
  });
  it('earns every tier at or below the count, in track order', () => {
    expect(dueStamps({ ...none, votes: 1, digests: 12 })).toEqual(['votes-1', 'digests-1', 'digests-10']);
    expect(dueStamps({ ...none, issues: 30, langs: 2 })).toEqual(['issues-1', 'issues-3', 'issues-10', 'issues-30', 'langs-2']);
    expect(dueStamps({ ...none, follows: 4 })).toEqual(['follows-1']);
  });
  it('knows the next tier on a track', () => {
    const issues = TRACKS.find((t) => t.id === 'issues')!;
    expect(nextTier(issues, 0)).toBe(1);
    expect(nextTier(issues, 4)).toBe(10);
    expect(nextTier(issues, 50)).toBeNull();
  });
  it('levels move with the number of stamps', () => {
    expect(levelOf(0)).toEqual({ level: 1, next: 2 });
    expect(levelOf(2)).toEqual({ level: 2, next: 5 });
    expect(levelOf(8)).toEqual({ level: 3, next: 9 });
    expect(levelOf(14)).toEqual({ level: 5, next: null });
  });
});

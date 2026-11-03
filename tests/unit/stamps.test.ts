import { describe, expect, it } from 'vitest';
import { dueStamps, hasRun } from '~/lib/stamps';

const none = { voted: false, solved: false, follows: 0, langs: 1, digestDone: false, completeIssues: [] };

describe('stamps', () => {
  it('earns nothing from a fresh reader', () => {
    expect(dueStamps(none)).toEqual([]);
  });
  it('earns each stamp from its own fact, in canonical order', () => {
    expect(dueStamps({ ...none, voted: true, digestDone: true })).toEqual(['first-vote', 'digest-done']);
    expect(dueStamps({ ...none, follows: 5, langs: 2 })).toEqual(['five-follows', 'both-languages']);
    expect(dueStamps({ ...none, follows: 4 })).toEqual([]);
    expect(dueStamps({ ...none, solved: true })).toEqual(['first-solve']);
  });
  it('three issues in a row means consecutive numbers', () => {
    expect(hasRun([17, 18, 19])).toBe(true);
    expect(hasRun([20, 18, 19, 3])).toBe(true);
    expect(hasRun([17, 19, 21])).toBe(false);
    expect(hasRun([1, 2])).toBe(false);
    expect(dueStamps({ ...none, completeIssues: [17, 18, 19, 20] })).toEqual(['three-issues']);
  });
});

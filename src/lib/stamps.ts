// Stamps: small brand-shaped marks for the first time a reader does something. Earned once, kept
// forever, printed on My Corner. The rules live here so the simulation and a real backend agree.

export const STAMP_IDS = ['first-vote', 'first-solve', 'five-follows', 'both-languages', 'digest-done', 'three-issues'] as const;
export type StampId = (typeof STAMP_IDS)[number];

export interface Stamp {
  id: StampId;
  at: string;
}

export interface StampFacts {
  voted: boolean;
  solved: boolean;
  follows: number;
  langs: number;
  digestDone: boolean;
  /** Issue numbers the reader completed. */
  completeIssues: number[];
}

/** True when `issues` holds `n` consecutive numbers. */
export function hasRun(issues: number[], n = 3): boolean {
  const set = new Set(issues);
  for (const i of set) {
    let k = 1;
    while (set.has(i + k)) k++;
    if (k >= n) return true;
  }
  return false;
}

/** Every stamp the facts earn, in the canonical order. */
export function dueStamps(f: StampFacts): StampId[] {
  const out: StampId[] = [];
  if (f.voted) out.push('first-vote');
  if (f.solved) out.push('first-solve');
  if (f.follows >= 5) out.push('five-follows');
  if (f.langs >= 2) out.push('both-languages');
  if (f.digestDone) out.push('digest-done');
  if (hasRun(f.completeIssues, 3)) out.push('three-issues');
  return out;
}

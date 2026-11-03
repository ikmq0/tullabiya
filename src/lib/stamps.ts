// Milestones: tracks of what a reader keeps doing, each with tiers that stay ahead of them as the
// issues pile up (10 issues, 30, 50 …). A tier is a stamp, earned once and kept. The rules live here
// so the simulation and a real backend agree.

export type TrackId = 'issues' | 'votes' | 'hunts' | 'follows' | 'digests' | 'langs';

export interface Track {
  id: TrackId;
  /** Thresholds, ascending; the last one carries the Deanship's reward for the first to reach it. */
  tiers: number[];
}

export const TRACKS: readonly Track[] = [
  { id: 'issues', tiers: [1, 3, 10, 30, 50] },
  { id: 'votes', tiers: [1, 10, 30] },
  { id: 'hunts', tiers: [1, 3, 10] },
  { id: 'follows', tiers: [1, 5, 10] },
  { id: 'digests', tiers: [1, 10, 30] },
  { id: 'langs', tiers: [2] },
] as const;

export type StampId = `${TrackId}-${number}`;

export interface Stamp {
  id: StampId;
  at: string;
}

/** What the reader has done, as counts. */
export type StampFacts = Record<TrackId, number>;

export function stampId(track: TrackId, tier: number): StampId {
  return `${track}-${tier}`;
}

export const STAMP_IDS: StampId[] = TRACKS.flatMap((t) => t.tiers.map((n) => stampId(t.id, n)));

/** Every stamp the facts earn, in track order. */
export function dueStamps(f: StampFacts): StampId[] {
  return TRACKS.flatMap((t) => t.tiers.filter((n) => (f[t.id] ?? 0) >= n).map((n) => stampId(t.id, n)));
}

/** The next tier on a track, or null when all are earned. */
export function nextTier(track: Track, count: number): number | null {
  return track.tiers.find((n) => count < n) ?? null;
}

/** Levels: one per band of earned stamps, so the title keeps moving as the tracks grow. */
export const LEVELS = [0, 2, 5, 9, 14] as const;

export function levelOf(earned: number): { level: number; next: number | null } {
  let level = 1;
  for (let i = 1; i < LEVELS.length; i++) if (earned >= LEVELS[i]) level = i + 1;
  const next = level < LEVELS.length ? LEVELS[level] : null;
  return { level, next };
}

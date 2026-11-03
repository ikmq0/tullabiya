// The one seam between the UI and any backend. LocalApi simulates it in the
// browser; a real implementation replaces it without touching the islands.
import type { CollegeId, Favorites, Profile, SectionId } from '~/lib/model';

export interface IssueProgress {
  issue: number;
  sectionsRead: SectionId[];
  voted: boolean;
  huntAttempted: boolean;
  /** The 5-minute version was read to its end. */
  digestDone?: boolean;
}

export interface PollOptionState {
  id: string;
  count: number;
  pct: number;
}

export interface PollState {
  id: string;
  total: number;
  options: PollOptionState[];
  myVote?: string;
  /** Present only for colleges with enough votes to protect anonymity. */
  byCollege?: Partial<Record<CollegeId, { n: number; pct: Record<string, number> }>>;
}

export interface HuntSolved {
  rank: number | null;
  seat: 'first' | 'draw' | 'none';
  code: string;
  at: string;
}

export interface VisitDelta {
  first: boolean;
  sinceAt: string | null;
  votesSince: number;
  newClues: number;
}

export interface HuntState {
  id: string;
  closesAt: string;
  closed: boolean;
  attemptsLeft: number;
  /** 1-based count of clues open so far; they drop weekly. */
  clueIndex: number;
  clueCount: number;
  /** Day the next clue opens, or null when all are open. */
  nextClueAt: string | null;
  takenSeats: number;
  firstSeats: number;
  drawSeats: number;
  solved?: HuntSolved;
}

export interface HuntResult {
  ok: boolean;
  reason?: 'wrong' | 'closed' | 'rate-limited' | 'empty';
  state: HuntState;
}

export type ReactionKind = 'useful' | 'inspiring' | 'metoo';

export interface ReactionState {
  counts: Record<ReactionKind, number>;
  mine: ReactionKind[];
}

export type SubmissionKind = 'guest-answer' | 'ask-guest' | 'caption' | 'kudos' | 'pitch' | 'contact' | 'comment';

export interface Submission {
  id: string;
  kind: SubmissionKind;
  text: string;
  ref?: string;
  createdAt: string;
  status: 'pending';
}

export interface Api {
  getProfile(): Promise<Profile | null>;
  saveProfile(p: Profile): Promise<void>;
  clearProfile(): Promise<void>;
  getFavorites(): Promise<Favorites>;
  saveFavorites(f: Favorites): Promise<void>;
  getProgress(issue: number): Promise<IssueProgress>;
  markProgress(issue: number, patch: Partial<IssueProgress>): Promise<IssueProgress>;
  getPoll(id: string): Promise<PollState>;
  vote(id: string, optionId: string): Promise<PollState>;
  subscribePoll(id: string, cb: (s: PollState) => void): () => void;
  getHunt(id: string): Promise<HuntState>;
  submitHuntAnswer(id: string, text: string): Promise<HuntResult>;
  getReactions(storyId: string): Promise<ReactionState>;
  toggleReaction(storyId: string, kind: ReactionKind): Promise<ReactionState>;
  submitUserContent(kind: SubmissionKind, text: string, ref?: string): Promise<Submission>;
  listMySubmissions(): Promise<Submission[]>;
  upvoteQuestion(id: string): Promise<{ count: number; mine: boolean }>;
  /** Records a visit and says what changed since the previous one. */
  visit(issue: number, lang: string): Promise<VisitDelta>;
  getRegistrations(): Promise<string[]>;
  toggleRegistration(eventId: string): Promise<string[]>;
  getReminders(): Promise<string[]>;
  toggleReminder(eventId: string): Promise<string[]>;
  getSaved(): Promise<string[]>;
  toggleSaved(storyId: string): Promise<string[]>;
  exportAll(): Promise<string>;
  reset(): Promise<void>;
}

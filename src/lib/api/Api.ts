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

import type { Stamp } from '~/lib/stamps';

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

/** Where a reader left an issue in the digital reader. */
export interface ReaderPosition {
  issue: number;
  /** 1-based printed page. */
  page: number;
  /** The story being read on that page, when the reader went to one. */
  storyId?: string;
}

/** A rectangle on a printed page, normalized 0 to 1 from the page's top-left corner. */
export interface MarkRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The reader's own mark on a printed page. Private to the device unless the comment is sent to the editors. */
export interface PageMark {
  id: string;
  issue: number;
  page: number;
  rects: MarkRect[];
  comment: string;
  /** The submission id once sent to the editors. */
  sentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Api {
  getProfile(): Promise<Profile | null>;
  saveProfile(p: Profile): Promise<void>;
  clearProfile(): Promise<void>;
  getFavorites(): Promise<Favorites>;
  saveFavorites(f: Favorites): Promise<void>;
  getProgress(issue: number): Promise<IssueProgress>;
  markProgress(issue: number, patch: Partial<IssueProgress>): Promise<IssueProgress>;
  /** The last page read in the digital reader for one issue; null when the reader has not been there. */
  getReaderPosition(issue: number): Promise<ReaderPosition | null>;
  saveReaderPosition(issue: number, page: number, storyId?: string): Promise<ReaderPosition>;
  /** The reader's marks, oldest first; all of them, or one issue's. */
  listMarks(issue?: number): Promise<PageMark[]>;
  addMark(issue: number, page: number, rects: MarkRect[], comment?: string): Promise<PageMark>;
  updateMark(id: string, patch: { comment?: string; sentId?: string }): Promise<PageMark>;
  deleteMark(id: string): Promise<void>;
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
  /** Stamps earned so far, oldest first. */
  getStamps(): Promise<Stamp[]>;
  getRegistrations(): Promise<string[]>;
  toggleRegistration(eventId: string): Promise<string[]>;
  getReminders(): Promise<string[]>;
  toggleReminder(eventId: string): Promise<string[]>;
  getSaved(): Promise<string[]>;
  toggleSaved(storyId: string): Promise<string[]>;
  exportAll(): Promise<string>;
  reset(): Promise<void>;
}

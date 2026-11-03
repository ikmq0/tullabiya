// Simulated backend: one JSON blob in storage plus seeded numbers and live ticks.
// Replace with an HTTP implementation of Api; the islands never know.
import type {
  Api, HuntSolved, HuntState, IssueProgress, PollState, ReactionKind, ReactionState, Submission, SubmissionKind, VisitDelta,
} from './Api';
import { readJson, safeStorage, writeJson, type StorageLike } from './storage';
import { COLLEGE_ACCENT, EMPTY_FAVORITES, KEYS, type CollegeId, type Favorites, type Hunt, type Poll, type Profile } from '~/lib/model';
import { COMMUNITY, HUNTS, POLLS } from '~/data/interactive';
import { breakdownVisible, tally } from '~/lib/poll';
import { emptyProgress } from '~/lib/progress';
import { cluesOpenOn, makeCode, matchesAnswer } from '~/lib/hunt';
import { dueStamps, type Stamp, type StampFacts } from '~/lib/stamps';
import { issueState } from '~/lib/progress';
import { sanitizeText } from '~/lib/sanitize';

interface HuntUserState {
  attempts: number[];
  clueIndex: number;
  solved?: HuntSolved;
  winner?: { name: string; at: string; code: string };
}

interface State {
  v: 1;
  userId: string;
  profile: Profile | null;
  favorites: Favorites;
  progress: Record<string, IssueProgress>;
  votes: Record<string, string>;
  hunts: Record<string, HuntUserState>;
  reactions: Record<string, ReactionKind[]>;
  submissions: Submission[];
  upvotes: string[];
  registrations: string[];
  reminders: string[];
  saved: string[];
  /** Snapshot taken at the last visit, by wall-clock time, for "since your last visit". */
  lastVisit?: { at: number; pollTotals: Record<string, number>; clues: Record<string, number>; langs: string[]; delta: VisitDelta };
  stamps?: Stamp[];
}

export interface LocalApiDeps {
  storage?: StorageLike;
  now?: () => number;
  rng?: () => number;
  polls?: Poll[];
  hunts?: Hunt[];
  questions?: { id: string; votes: number }[];
  tickMs?: number;
  /** Wall-clock time for visit bookkeeping (the demo clock stands still). */
  wall?: () => number;
}

const WRONG_LIMIT = 4;
const SESSION_MS = 30 * 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const REACTIONS: ReactionKind[] = ['useful', 'inspiring', 'metoo'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function createLocalApi(deps: LocalApiDeps = {}): Api {
  const storage = deps.storage ?? safeStorage();
  const now = deps.now ?? (() => Date.now());
  const rng = deps.rng ?? Math.random;
  const polls = deps.polls ?? POLLS;
  const hunts = deps.hunts ?? HUNTS;
  const questions = deps.questions ?? COMMUNITY.questions.map((q) => ({ id: q.id, votes: q.votes }));
  const tickMs = deps.tickMs ?? 4000;
  const wall = deps.wall ?? (() => Date.now());
  // Live-looking increments live only in memory; the seed dominates after reload.
  const sim: Record<string, Record<string, number>> = {};

  function fresh(): State {
    return {
      v: 1,
      userId: `u-${Math.floor(rng() * 1e9).toString(36)}-${now().toString(36)}`,
      profile: null,
      favorites: { ...EMPTY_FAVORITES },
      progress: {},
      votes: {},
      hunts: {},
      reactions: {},
      submissions: [],
      upvotes: [],
      registrations: [],
      reminders: [],
      saved: [],
    };
  }
  function load(): State {
    const s = readJson<State | null>(storage, KEYS.state, null);
    if (s && s.v === 1 && typeof s.userId === 'string') return s;
    const f = fresh();
    writeJson(storage, KEYS.state, f);
    return f;
  }
  /** Awards whatever the state now earns; stamps are never taken back. */
  function facts(s: State): StampFacts {
    return {
      issues: Object.values(s.progress).filter((p) => issueState(p) === 'complete').length,
      votes: Object.keys(s.votes).length,
      hunts: Object.values(s.hunts).filter((h) => !!h.solved).length,
      follows: s.favorites.units.length,
      digests: Object.values(s.progress).filter((p) => !!p.digestDone).length,
      langs: s.lastVisit?.langs.length ?? 0,
    };
  }
  function settle(s: State): Stamp[] {
    const have = s.stamps ?? [];
    const got = new Set(have.map((x) => x.id));
    const due = dueStamps(facts(s));
    const at = new Date(wall()).toISOString();
    s.stamps = [...have, ...due.filter((id) => !got.has(id)).map((id) => ({ id, at }))];
    return s.stamps;
  }
  function save(s: State): void {
    settle(s);
    writeJson(storage, KEYS.state, s);
  }
  function pollDef(id: string): Poll {
    const p = polls.find((x) => x.id === id);
    if (!p) throw new Error(`unknown poll ${id}`);
    return p;
  }
  function huntDef(id: string): Hunt {
    const h = hunts.find((x) => x.id === id);
    if (!h) throw new Error(`unknown hunt ${id}`);
    return h;
  }

  function pollState(id: string, s: State): PollState {
    const p = pollDef(id);
    const my = s.votes[id];
    const counts: Record<string, number> = {};
    for (const o of p.options) counts[o.id] = (p.seed[o.id] ?? 0) + (sim[id]?.[o.id] ?? 0) + (my === o.id ? 1 : 0);
    const { total, pct } = tally(counts);
    const options = p.options.map((o) => ({ id: o.id, count: counts[o.id], pct: pct[o.id] }));
    const out: PollState = { id, total, options, myVote: my };
    if (p.seedByCollege) {
      const byCollege: PollState['byCollege'] = {};
      for (const [c, seed] of Object.entries(p.seedByCollege) as [CollegeId, Record<string, number>][]) {
        const cc: Record<string, number> = {};
        for (const o of p.options) cc[o.id] = seed[o.id] ?? 0;
        const tc = tally(cc);
        if (breakdownVisible(tc.total)) byCollege[c] = { n: tc.total, pct: tc.pct };
      }
      if (Object.keys(byCollege).length) out.byCollege = byCollege;
    }
    return out;
  }

  function huntUser(s: State, id: string): HuntUserState {
    return (s.hunts[id] ??= { attempts: [], clueIndex: 1 });
  }
  function huntState(id: string, s: State): HuntState {
    const h = huntDef(id);
    const u = huntUser(s, id);
    const t = now();
    const recentWrong = u.attempts.filter((a) => t - a < WINDOW_MS).length;
    const closed = t > new Date(h.closesAt).getTime();
    const drop = cluesOpenOn(h.closesAt.slice(0, 8) + '01', t, h.clues.length);
    return {
      id,
      closesAt: h.closesAt,
      closed,
      attemptsLeft: Math.max(0, WRONG_LIMIT - recentWrong),
      clueIndex: drop.open,
      clueCount: h.clues.length,
      nextClueAt: drop.next,
      takenSeats: Math.min(h.firstSeats, h.seedTaken + (u.solved?.seat === 'first' ? 1 : 0)),
      firstSeats: h.firstSeats,
      drawSeats: h.drawSeats,
      solved: u.solved,
      winner: u.winner,
    };
  }

  function seedReactions(storyId: string): Record<ReactionKind, number> {
    const h = hash(storyId);
    return { useful: 10 + (h % 60), inspiring: 5 + ((h >>> 3) % 70), metoo: 3 + ((h >>> 6) % 40) };
  }
  function reactionState(storyId: string, s: State): ReactionState {
    const mine = s.reactions[storyId] ?? [];
    const counts = seedReactions(storyId);
    for (const k of mine) counts[k] += 1;
    return { counts, mine: [...mine] };
  }

  return {
    async getProfile() {
      const p = load().profile as (Profile & { college?: CollegeId }) | null;
      // Profiles saved before "your color" carried a college; keep them, mapped to the matching accent.
      if (p && !p.color) return { name: p.name, address: p.address, avatar: p.avatar, color: COLLEGE_ACCENT[p.college ?? 'eng'] };
      return p;
    },
    async saveProfile(p) {
      const s = load();
      s.profile = { ...p, name: sanitizeText(p.name, 60) };
      save(s);
    },
    async clearProfile() {
      const s = load();
      s.profile = null;
      save(s);
    },
    async getFavorites() {
      return load().favorites;
    },
    async saveFavorites(f) {
      const s = load();
      s.favorites = { sections: Array.from(new Set(f.sections)).slice(0, 5), units: Array.from(new Set(f.units)) };
      save(s);
    },
    async getProgress(issue) {
      return load().progress[String(issue)] ?? emptyProgress(issue);
    },
    async markProgress(issue, patch) {
      const s = load();
      const cur = s.progress[String(issue)] ?? emptyProgress(issue);
      const next: IssueProgress = {
        issue,
        sectionsRead: Array.from(new Set([...cur.sectionsRead, ...(patch.sectionsRead ?? [])])),
        voted: patch.voted ?? cur.voted,
        huntAttempted: patch.huntAttempted ?? cur.huntAttempted,
        digestDone: patch.digestDone ?? cur.digestDone,
      };
      s.progress[String(issue)] = next;
      save(s);
      return next;
    },
    async getPoll(id) {
      return pollState(id, load());
    },
    async vote(id, optionId) {
      const s = load();
      const p = pollDef(id);
      if (!p.options.some((o) => o.id === optionId)) throw new Error(`unknown option ${optionId}`);
      if (!s.votes[id]) {
        s.votes[id] = optionId;
        const cur = s.progress[String(p.issue)] ?? emptyProgress(p.issue);
        s.progress[String(p.issue)] = { ...cur, voted: true };
        save(s);
      }
      return pollState(id, s);
    },
    subscribePoll(id, cb) {
      const p = pollDef(id);
      cb(pollState(id, load()));
      const timer = setInterval(() => {
        const add = Math.floor(rng() * 4);
        if (add > 0) {
          const weights = p.options.map((o) => p.seed[o.id] ?? 1);
          const sum = weights.reduce((a, b) => a + b, 0) || 1;
          let r = rng() * sum;
          let pick = p.options[0].id;
          for (let i = 0; i < p.options.length; i++) {
            r -= weights[i];
            if (r <= 0) {
              pick = p.options[i].id;
              break;
            }
          }
          (sim[id] ??= {})[pick] = (sim[id][pick] ?? 0) + add;
        }
        cb(pollState(id, load()));
      }, tickMs);
      return () => clearInterval(timer);
    },
    async getHunt(id) {
      return huntState(id, load());
    },
    async submitHuntAnswer(id, text) {
      const s = load();
      const h = huntDef(id);
      const u = huntUser(s, id);
      const mark = () => {
        const cur = s.progress[String(h.issue)] ?? emptyProgress(h.issue);
        s.progress[String(h.issue)] = { ...cur, huntAttempted: true };
      };
      if (u.solved) return { ok: true, state: huntState(id, s) };
      const clean = sanitizeText(text, 120);
      if (!clean) return { ok: false, reason: 'empty', state: huntState(id, s) };
      const st = huntState(id, s);
      if (st.closed) return { ok: false, reason: 'closed', state: st };
      if (st.attemptsLeft <= 0) return { ok: false, reason: 'rate-limited', state: st };
      if (matchesAnswer(clean, h.answers)) {
        const rank = h.seedTaken + 1;
        u.solved = {
          rank,
          seat: rank <= h.firstSeats ? 'first' : 'draw',
          code: makeCode(rng),
          at: new Date(now()).toISOString(),
        };
        mark();
        save(s);
        return { ok: true, state: huntState(id, s) };
      }
      u.attempts.push(now());
      mark();
      save(s);
      return { ok: false, reason: 'wrong', state: huntState(id, s) };
    },
    async claimFound(id, name) {
      const s = load();
      const h = huntDef(id);
      const u = huntUser(s, id);
      const st = huntState(id, s);
      if (u.winner) return { ok: false, reason: 'found', state: st };
      if (st.closed) return { ok: false, reason: 'closed', state: st };
      const clean = sanitizeText(name, 60);
      if (!clean) return { ok: false, reason: 'empty', state: st };
      const at = new Date(now()).toISOString();
      const code = makeCode(rng);
      u.winner = { name: clean, at, code };
      u.solved = { rank: 1, seat: 'first', code, at };
      const cur = s.progress[String(h.issue)] ?? emptyProgress(h.issue);
      s.progress[String(h.issue)] = { ...cur, huntAttempted: true };
      save(s);
      return { ok: true, state: huntState(id, s) };
    },
    async getReactions(storyId) {
      return reactionState(storyId, load());
    },
    async toggleReaction(storyId, kind) {
      if (!REACTIONS.includes(kind)) throw new Error(`unknown reaction ${kind}`);
      const s = load();
      const mine = s.reactions[storyId] ?? [];
      s.reactions[storyId] = mine.includes(kind) ? mine.filter((k) => k !== kind) : [...mine, kind];
      save(s);
      return reactionState(storyId, s);
    },
    async submitUserContent(kind, text, ref) {
      const clean = sanitizeText(text, kind === 'pitch' || kind === 'contact' ? 600 : 280);
      if (!clean) throw new Error('empty');
      const s = load();
      const sub: Submission = {
        id: `S-${(hash(clean + now()) % 46656).toString(36).toUpperCase().padStart(3, '0')}`,
        kind: kind as SubmissionKind,
        text: clean,
        ref,
        createdAt: new Date(now()).toISOString(),
        status: 'pending',
      };
      s.submissions.push(sub);
      save(s);
      return sub;
    },
    async listMySubmissions() {
      return [...load().submissions].reverse();
    },
    async upvoteQuestion(id) {
      const q = questions.find((x) => x.id === id);
      if (!q) throw new Error(`unknown question ${id}`);
      const s = load();
      s.upvotes = toggleIn(s.upvotes, id);
      save(s);
      const mine = s.upvotes.includes(id);
      return { count: q.votes + (mine ? 1 : 0), mine };
    },
    async visit(issue, lang) {
      const s = load();
      const t = wall();
      const pollTotals: Record<string, number> = {};
      for (const p of polls.filter((x) => x.issue === issue)) pollTotals[p.id] = pollState(p.id, s).total;
      const clues: Record<string, number> = {};
      for (const h of hunts.filter((x) => x.issue === issue)) clues[h.id] = huntState(h.id, s).clueIndex;
      const prev = s.lastVisit;
      const langs = Array.from(new Set([...(prev?.langs ?? []), lang]));
      let delta: VisitDelta;
      if (!prev) {
        delta = { first: true, sinceAt: null, votesSince: 0, newClues: 0 };
        s.lastVisit = { at: t, pollTotals, clues, langs, delta };
      } else if (t - prev.at <= SESSION_MS) {
        // Still the same session: the same answer as when it began.
        delta = prev.delta;
        s.lastVisit = { ...prev, langs };
      } else {
        // Sample growth: this simulation has no other readers, so the pulse gains about seven votes
        // for every hour the reader was away.
        const drift = Math.floor(((t - prev.at) / 3_600_000) * 7);
        const votesSince = Object.keys(pollTotals).reduce((a, id) => a + Math.max(0, pollTotals[id] - (prev.pollTotals[id] ?? pollTotals[id])), 0) + drift;
        const newClues = Object.keys(clues).reduce((a, id) => a + Math.max(0, clues[id] - (prev.clues[id] ?? clues[id])), 0);
        delta = { first: false, sinceAt: new Date(prev.at).toISOString(), votesSince, newClues };
        s.lastVisit = { at: t, pollTotals, clues, langs, delta };
      }
      save(s);
      return delta;
    },
    async getStamps() {
      return settle(load());
    },
    async getCounts() {
      return facts(load());
    },
    async getRegistrations() {
      return [...load().registrations];
    },
    async toggleRegistration(eventId) {
      const s = load();
      s.registrations = toggleIn(s.registrations, eventId);
      save(s);
      return [...s.registrations];
    },
    async getReminders() {
      return [...load().reminders];
    },
    async toggleReminder(eventId) {
      const s = load();
      s.reminders = toggleIn(s.reminders, eventId);
      save(s);
      return [...s.reminders];
    },
    async getSaved() {
      return [...load().saved];
    },
    async toggleSaved(storyId) {
      const s = load();
      s.saved = toggleIn(s.saved, storyId);
      save(s);
      return [...s.saved];
    },
    async exportAll() {
      return JSON.stringify(load(), null, 2);
    },
    async reset() {
      try {
        storage.removeItem(KEYS.state);
      } catch {}
      for (const k of Object.keys(sim)) delete sim[k];
    },
  };
}

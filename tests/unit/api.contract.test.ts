// Contract tests for the Api seam. Written against LocalApi; reusable for a real backend.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLocalApi } from '~/lib/api/LocalApi';
import { memoryStorage, type StorageLike } from '~/lib/api/storage';
import type { Hunt, Poll } from '~/lib/model';

const T0 = new Date('2026-09-12T10:00:00+03:00').getTime();

function seededRng(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const smallPoll: Poll = {
  id: 'p-small',
  issue: 21,
  kind: 'fun',
  question: { ar: 'س' },
  options: [{ id: 'a', label: { ar: 'أ' } }, { id: 'b', label: { ar: 'ب' } }],
  seed: { a: 0, b: 0 },
  seedByCollege: { eng: { a: 12, b: 6 }, comp: { a: 30, b: 10 } },
  sample: true,
};

const hunt: Hunt = {
  id: 'h',
  issue: 21,
  riddle: { ar: 'لغز' },
  clues: [{ text: { ar: '1' } }, { text: { ar: '2' } }, { text: { ar: '3' } }],
  answers: ['حروف الجامعة', 'KFUPM'],
  closesAt: '2026-09-20T23:59:00+03:00',
  prize: { ar: 'قهوة' },
  firstSeats: 10,
  drawSeats: 5,
  seedTaken: 7,
  sample: true,
};

function make(storage: StorageLike = memoryStorage(), now = () => T0) {
  return createLocalApi({ storage, now, rng: seededRng(7), polls: [smallPoll], hunts: [hunt], tickMs: 1000 });
}

afterEach(() => vi.useRealTimers());

describe('polls', () => {
  it('vote is idempotent per user', async () => {
    const api = make();
    const first = await api.vote('p-small', 'a');
    const second = await api.vote('p-small', 'b');
    expect(second).toEqual(first);
    expect(second.myVote).toBe('a');
    expect(second.total).toBe(1);
  });
  it('a second instance on the same storage sees the earlier vote', async () => {
    const storage = memoryStorage();
    await make(storage).vote('p-small', 'a');
    const s = await make(storage).getPoll('p-small');
    expect(s.myVote).toBe('a');
  });
  it('zero votes gives pct 0, never NaN', async () => {
    const s = await make().getPoll('p-small');
    expect(s.total).toBe(0);
    for (const o of s.options) expect(o.pct).toBe(0);
  });
  it('percentages sum to 100 after a vote', async () => {
    const s = await make().vote('p-small', 'b');
    expect(s.options.reduce((a, o) => a + o.pct, 0)).toBe(100);
  });
  it('byCollege omits colleges with fewer than 20 votes', async () => {
    const s = await make().getPoll('p-small');
    expect(s.byCollege?.comp).toBeDefined();
    expect(s.byCollege?.eng).toBeUndefined();
  });
  it('subscribePoll ticks and stops after unsubscribe', async () => {
    vi.useFakeTimers();
    const api = make();
    const cb = vi.fn();
    const stop = api.subscribePoll('p-small', cb);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(cb.mock.calls.length).toBe(4);
    stop();
    vi.advanceTimersByTime(3000);
    expect(cb.mock.calls.length).toBe(4);
  });
  it('voting marks the issue progress', async () => {
    const api = make();
    await api.vote('p-small', 'a');
    expect((await api.getProgress(21)).voted).toBe(true);
  });
});

describe('progress', () => {
  it('markProgress merges sectionsRead without duplicates', async () => {
    const api = make();
    await api.markProgress(21, { sectionsRead: ['news'] });
    const p = await api.markProgress(21, { sectionsRead: ['news', 'guest'] });
    expect(p.sectionsRead).toEqual(['news', 'guest']);
    expect(p.voted).toBe(false);
  });
});

describe('submissions and privacy', () => {
  it('submitUserContent returns pending and never appears publicly', async () => {
    const api = make();
    const sub = await api.submitUserContent('caption', '<b>تعليق</b> رائع');
    expect(sub.status).toBe('pending');
    expect(sub.text).toBe('تعليق رائع');
    expect(sub.id).toMatch(/^S-/);
    const mine = await api.listMySubmissions();
    expect(mine.map((s) => s.id)).toContain(sub.id);
    // another user on another storage sees nothing
    expect(await make(memoryStorage()).listMySubmissions()).toEqual([]);
  });
  it('rejects empty text', async () => {
    await expect(make().submitUserContent('kudos', '   ')).rejects.toThrow(/empty/);
  });
});

describe('storage failures', () => {
  it('every call works when storage throws', async () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const api = createLocalApi({ storage: throwing, now: () => T0, polls: [smallPoll], hunts: [hunt] });
    await expect(api.getProfile()).resolves.toBeNull();
    await expect(api.vote('p-small', 'a')).resolves.toBeTruthy();
    await expect(api.getPoll('p-small')).resolves.toBeTruthy();
    await expect(api.toggleSaved('x')).resolves.toBeTruthy();
    await expect(api.getHunt('h')).resolves.toBeTruthy();
    await expect(api.reset()).resolves.toBeUndefined();
  });
});

describe('hunt', () => {
  it('accepts a correct answer typed with diacritics and assigns a seat and code', async () => {
    const api = make();
    const r = await api.submitHuntAnswer('h', 'حُرُوفُ الجَامِعَة');
    expect(r.ok).toBe(true);
    expect(r.state.solved?.seat).toBe('first');
    expect(r.state.solved?.rank).toBe(8);
    expect(r.state.solved?.code).toMatch(/^KFUPM-[A-Z]{4}$/);
    expect(r.state.takenSeats).toBe(8);
    expect((await api.getProgress(21)).huntAttempted).toBe(true);
  });
  it('a wrong answer unlocks the next clue; the fifth wrong attempt in an hour is rate-limited', async () => {
    const api = make();
    const r1 = await api.submitHuntAnswer('h', 'المكتبة');
    expect(r1.ok).toBe(false);
    expect(r1.reason).toBe('wrong');
    expect(r1.state.clueIndex).toBe(2);
    await api.submitHuntAnswer('h', 'x1');
    await api.submitHuntAnswer('h', 'x2');
    const r4 = await api.submitHuntAnswer('h', 'x3');
    expect(r4.reason).toBe('wrong');
    expect(r4.state.attemptsLeft).toBe(0);
    const r5 = await api.submitHuntAnswer('h', 'x4');
    expect(r5.reason).toBe('rate-limited');
  });
  it('closed after closesAt', async () => {
    const api = make(memoryStorage(), () => new Date('2026-09-21T00:00:00+03:00').getTime());
    const r = await api.submitHuntAnswer('h', 'KFUPM');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('closed');
  });
  it('an empty answer consumes no attempt', async () => {
    const api = make();
    const r = await api.submitHuntAnswer('h', '  ');
    expect(r.reason).toBe('empty');
    expect(r.state.attemptsLeft).toBe(4);
    expect(r.state.clueIndex).toBe(1);
  });
});

describe('reactions, upvotes, toggles', () => {
  it('toggleReaction twice returns the original count and mine lists only mine', async () => {
    const api = make();
    const base = await api.getReactions('21-musab');
    const on = await api.toggleReaction('21-musab', 'useful');
    expect(on.counts.useful).toBe(base.counts.useful + 1);
    expect(on.mine).toEqual(['useful']);
    const off = await api.toggleReaction('21-musab', 'useful');
    expect(off.counts.useful).toBe(base.counts.useful);
    expect(off.mine).toEqual([]);
  });
  it('upvoteQuestion toggles and never double counts', async () => {
    const api = make();
    const a = await api.upvoteQuestion('cq1');
    expect(a.mine).toBe(true);
    expect(a.count).toBe(42);
    const b = await api.upvoteQuestion('cq1');
    expect(b).toEqual({ count: 41, mine: false });
  });
  it('registrations, reminders and saved toggle', async () => {
    const api = make();
    expect(await api.toggleRegistration('e1')).toEqual(['e1']);
    expect(await api.toggleRegistration('e1')).toEqual([]);
    expect(await api.toggleReminder('e2')).toEqual(['e2']);
    expect(await api.toggleSaved('s1')).toEqual(['s1']);
  });
  it('reset clears everything and export is JSON', async () => {
    const api = make();
    await api.saveProfile({ name: 'سعد', color: 'orange', address: 'm' });
    expect(JSON.parse(await api.exportAll()).profile.name).toBe('سعد');
    await api.reset();
    expect(await api.getProfile()).toBeNull();
  });
});

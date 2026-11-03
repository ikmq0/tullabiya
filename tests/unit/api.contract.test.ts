// Contract tests for the Api seam. Written against LocalApi; reusable for a real backend.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLocalApi } from '~/lib/api/LocalApi';
import { memoryStorage, type StorageLike } from '~/lib/api/storage';
import { KEYS, type Hunt, type Poll } from '~/lib/model';

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

describe('reader position', () => {
  it('is null until the reader has been there', async () => {
    expect(await make().getReaderPosition(21)).toBeNull();
  });
  it('remembers the page per issue, across instances', async () => {
    const storage = memoryStorage();
    expect(await make(storage).saveReaderPosition(21, 5)).toEqual({ issue: 21, page: 5 });
    await make(storage).saveReaderPosition(7, 2);
    expect(await make(storage).getReaderPosition(21)).toEqual({ issue: 21, page: 5 });
    expect(await make(storage).getReaderPosition(7)).toEqual({ issue: 7, page: 2 });
    expect(await make(storage).getReaderPosition(3)).toBeNull();
  });
  it('remembers the story too, and forgets it when the reader moves on without one', async () => {
    const api = make();
    await api.saveReaderPosition(21, 5, '21-musab');
    expect(await api.getReaderPosition(21)).toEqual({ issue: 21, page: 5, storyId: '21-musab' });
    await api.saveReaderPosition(21, 6);
    expect(await api.getReaderPosition(21)).toEqual({ issue: 21, page: 6 });
  });
  it('the latest save wins and a nonsense page settles on the first', async () => {
    const api = make();
    await api.saveReaderPosition(21, 5);
    expect((await api.saveReaderPosition(21, 6)).page).toBe(6);
    expect((await api.saveReaderPosition(21, 0)).page).toBe(1);
    expect((await api.saveReaderPosition(21, Number.NaN)).page).toBe(1);
  });
  it('tolerates state stored before the reader existed, and keeps everything else in it', async () => {
    const storage = memoryStorage();
    await make(storage).saveProfile({ name: 'سعد', color: 'orange', address: 'm' });
    const old = JSON.parse(storage.getItem(KEYS.state)!);
    delete old.reader;
    storage.setItem(KEYS.state, JSON.stringify(old));
    expect(await make(storage).getReaderPosition(21)).toBeNull();
    await make(storage).saveReaderPosition(21, 3);
    expect((await make(storage).getReaderPosition(21))?.page).toBe(3);
    expect((await make(storage).getProfile())?.name).toBe('سعد');
  });
  it('ignores a malformed stored position', async () => {
    const storage = memoryStorage();
    await make(storage).saveReaderPosition(21, 3);
    const state = JSON.parse(storage.getItem(KEYS.state)!);
    state.reader['21'] = { page: 'three' };
    storage.setItem(KEYS.state, JSON.stringify(state));
    expect(await make(storage).getReaderPosition(21)).toBeNull();
  });
  it('is erased by reset', async () => {
    const api = make();
    await api.saveReaderPosition(21, 3);
    await api.reset();
    expect(await api.getReaderPosition(21)).toBeNull();
  });
});

describe('page marks', () => {
  const rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.05 };

  it('keeps marks per issue, across instances, oldest first', async () => {
    const storage = memoryStorage();
    const a = await make(storage).addMark(21, 3, [rect]);
    const b = await make(storage).addMark(21, 5, [rect, { ...rect, y: 0.3 }], 'ملاحظة');
    const c = await make(storage).addMark(7, 1, [rect]);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    const mine = await make(storage).listMarks(21);
    expect(mine.map((m) => m.id)).toEqual([a.id, b.id]);
    expect(mine[0]).toMatchObject({ issue: 21, page: 3, rects: [rect], comment: '' });
    expect(mine[1].rects.length).toBe(2);
    expect(mine[1].comment).toBe('ملاحظة');
    expect((await make(storage).listMarks()).length).toBe(3);
    expect(await make(memoryStorage()).listMarks()).toEqual([]);
  });
  it('comments are plain text, capped, and editable', async () => {
    const api = make();
    const m = await api.addMark(21, 3, [rect], '<img src=x onerror=alert(1)>مفيد <b>جداً</b>');
    expect(m.comment).toBe('مفيد جداً');
    const long = await api.updateMark(m.id, { comment: 'ب'.repeat(500) });
    expect(Array.from(long.comment).length).toBe(280);
    expect((await api.updateMark(m.id, { comment: '  ' })).comment).toBe('');
  });
  it('rejects a mark with nothing to mark and clamps rectangles to the page', async () => {
    const api = make();
    await expect(api.addMark(21, 3, [])).rejects.toThrow();
    await expect(api.addMark(21, 0, [rect])).rejects.toThrow();
    await expect(api.addMark(21, 3, [{ x: 0, y: 0, w: 0, h: 0.2 }])).rejects.toThrow();
    await expect(api.addMark(21, 3, [{ x: Number.NaN, y: 0, w: 1, h: 1 }])).rejects.toThrow();
    const m = await api.addMark(21, 3, [{ x: 0.9, y: -1, w: 0.5, h: 0.5 }]);
    expect(m.rects[0]).toEqual({ x: 0.9, y: 0, w: expect.closeTo(0.1), h: 0.5 });
  });
  it('delete removes only that one, and updating an unknown one fails', async () => {
    const api = make();
    const a = await api.addMark(21, 3, [rect]);
    const b = await api.addMark(21, 4, [rect]);
    await api.deleteMark(a.id);
    expect((await api.listMarks()).map((m) => m.id)).toEqual([b.id]);
    await expect(api.updateMark(a.id, { comment: 'x' })).rejects.toThrow();
  });
  it('sending to the editors goes through the pending submissions and is never public', async () => {
    const api = make();
    const m = await api.addMark(21, 3, [rect], 'تعليق');
    const sub = await api.submitUserContent('comment', m.comment, 'issue-21-page-3');
    expect(sub.status).toBe('pending');
    expect((await api.updateMark(m.id, { sentId: sub.id })).sentId).toBe(sub.id);
    expect((await api.listMySubmissions()).map((s) => s.id)).toContain(sub.id);
    expect(await make(memoryStorage()).listMySubmissions()).toEqual([]);
  });
  it('tolerates state stored before marks, is in the export, and is cleared by reset', async () => {
    const storage = memoryStorage();
    await make(storage).saveProfile({ name: 'سعد', color: 'orange', address: 'm' });
    const old = JSON.parse(storage.getItem(KEYS.state)!);
    delete old.marks;
    storage.setItem(KEYS.state, JSON.stringify(old));
    const api = make(storage);
    expect(await api.listMarks()).toEqual([]);
    const m = await api.addMark(21, 3, [rect]);
    expect(JSON.parse(await api.exportAll()).marks[0].id).toBe(m.id);
    await api.reset();
    expect(await api.listMarks()).toEqual([]);
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
    await expect(api.saveReaderPosition(21, 2)).resolves.toBeTruthy();
    await expect(api.getReaderPosition(21)).resolves.toBeNull();
    await expect(api.addMark(21, 1, [{ x: 0, y: 0, w: 0.5, h: 0.5 }])).resolves.toBeTruthy();
    await expect(api.listMarks()).resolves.toEqual([]);
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
  it('clues drop weekly by date, never by wrong answers', async () => {
    const at = (d: string) => make(memoryStorage(), () => new Date(`${d}T10:00:00+03:00`).getTime());
    expect((await at('2026-09-03').getHunt('h')).clueIndex).toBe(1);
    expect((await at('2026-09-03').getHunt('h')).nextClueAt).toBe('2026-09-08');
    expect((await at('2026-09-12').getHunt('h')).clueIndex).toBe(2);
    expect((await at('2026-09-12').getHunt('h')).nextClueAt).toBe('2026-09-15');
    expect((await at('2026-09-16').getHunt('h')).clueIndex).toBe(3);
    expect((await at('2026-09-16').getHunt('h')).nextClueAt).toBeNull();
  });
  it('a wrong answer keeps the clue count; the fifth wrong attempt in an hour is rate-limited', async () => {
    const api = make();
    const before = (await api.getHunt('h')).clueIndex;
    const r1 = await api.submitHuntAnswer('h', 'المكتبة');
    expect(r1.ok).toBe(false);
    expect(r1.reason).toBe('wrong');
    expect(r1.state.clueIndex).toBe(before);
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

describe('visits', () => {
  it('the first visit has nothing to report; a later one counts the drift and new clues', async () => {
    const storage = memoryStorage();
    let wallNow = new Date('2026-09-10T09:00:00+03:00').getTime();
    let demo = new Date('2026-09-03T09:00:00+03:00').getTime();
    const api = () => createLocalApi({ storage, now: () => demo, wall: () => wallNow, polls: [smallPoll], hunts: [hunt] });
    const first = await api().visit(21, 'ar');
    expect(first.first).toBe(true);
    wallNow += 2 * 3_600_000;
    demo = new Date('2026-09-16T09:00:00+03:00').getTime();
    const later = await api().visit(21, 'en');
    expect(later.first).toBe(false);
    expect(later.votesSince).toBe(14);
    expect(later.newClues).toBe(2);
    const again = await api().visit(21, 'ar');
    expect(again.votesSince).toBe(14);
  });
});

describe('stamps', () => {
  it('the first vote earns first-vote, kept across instances; nothing twice', async () => {
    const storage = memoryStorage();
    expect(await make(storage).getStamps()).toEqual([]);
    await make(storage).vote('p-small', 'a');
    const got = await make(storage).getStamps();
    expect(got.map((s) => s.id)).toEqual(['first-vote']);
    await make(storage).vote('p-small', 'a');
    expect((await make(storage).getStamps()).length).toBe(1);
  });
});

// Arabic-aware answer matching and the fair winner pick (first N, then a random draw).

const DIACRITICS = /[ً-ٰٟؐ-ؚۖ-ۭ]/g;
const TATWEEL = /ـ/g;
const PUNCT = /[،؛؟٪-٭!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~«»“”‘’…]/g;
const ARABIC_INDIC = /[٠-٩۰-۹]/g;

/** Normalize so a correct answer is accepted however a student types it. */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFC')
    .replace(DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(ARABIC_INDIC, (d) => String((d.codePointAt(0)! - (d >= '۰' ? 0x06f0 : 0x0660)) % 10))
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesAnswer(input: string, answers: string[]): boolean {
  const n = normalizeAnswer(input);
  if (!n) return false;
  return answers.some((a) => normalizeAnswer(a) === n);
}

export interface HuntSubmission {
  userId: string;
  at: number;
  correct: boolean;
}

/** First `firstN` correct solvers by time (ties by userId), then `randomN` drawn from the rest. */
export function pickWinners(
  subs: HuntSubmission[],
  opts: { firstN: number; randomN: number; rng: () => number },
): { first: string[]; random: string[] } {
  const seen = new Set<string>();
  const correct: HuntSubmission[] = [];
  for (const s of [...subs].sort((a, b) => a.at - b.at || a.userId.localeCompare(b.userId))) {
    if (!s.correct || seen.has(s.userId)) continue;
    seen.add(s.userId);
    correct.push(s);
  }
  const first = correct.slice(0, opts.firstN).map((s) => s.userId);
  const rest = correct.slice(opts.firstN).map((s) => s.userId);
  // Fisher-Yates with the injected rng so draws are reproducible in tests.
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(opts.rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return { first, random: rest.slice(0, opts.randomN) };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function makeCode(rng: () => number): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return `KFUPM-${s}`;
}

const DAY_MS = 86_400_000;

/** Day in Riyadh for a timestamp, as YYYY-MM-DD. */
function riyadhDay(ms: number): string {
  return new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);
}

/** Weekly clue drops: clue k opens on day 1 + 7(k - 1) of the hunt's month (days 1, 8, 15), so the
 *  riddle gives three reasons to come back. The first clue is always open. */
export function cluesOpenOn(monthStartIso: string, nowMs: number, count: number): { open: number; next: string | null } {
  const start = new Date(`${monthStartIso}T00:00:00+03:00`).getTime();
  const days = Math.floor((nowMs - start) / DAY_MS);
  const open = Math.max(1, Math.min(count, 1 + Math.floor(days / 7)));
  if (open >= count) return { open, next: null };
  return { open, next: riyadhDay(start + open * 7 * DAY_MS) };
}

// Shared reader state for the islands: profile, pins, progress. Hydrated once from the Api.
import { atom } from 'nanostores';
import { getApi, type IssueProgress, type VisitDelta } from '~/lib/api';
import { accent, EMPTY_FAVORITES, KEYS, type Favorites, type Profile, type SectionId } from '~/lib/model';
import { readJson, safeStorage, writeJson } from '~/lib/api/storage';

export const $profile = atom<Profile | null>(null);
export const $favorites = atom<Favorites>(EMPTY_FAVORITES);
export const $progress = atom<IssueProgress | null>(null);
export const $ready = atom(false);
/** What changed since the reader's previous visit; null until known. */
export const $visit = atom<VisitDelta | null>(null);
/** Which sheet is open, shared across islands. */
export const $sheet = atom<'onboarding' | null>(null);
/** "My favorites only": lists narrow to followed publishers and pinned sections. Persisted. */
export const $forYou = atom(false);
const FORYOU = 'tullabiya:v1:foryou';
const NUDGED = 'tullabiya:v1:nudged';

export function setForYou(on: boolean): void {
  $forYou.set(on);
  writeJson(safeStorage(), FORYOU, on);
}

/** Your color reaches CSS as --me (and the text that passes on it as --me-ink). */
function applyAccent(p: Profile | null): void {
  if (typeof document === 'undefined') return;
  const st = document.documentElement.style;
  st.setProperty('--me', p ? accent(p.color).color : '');
  st.setProperty('--me-ink', p ? (accent(p.color).ink === 'ink' ? 'var(--ink)' : 'var(--beige)') : '');
}

/** Islands that only need the follows (chips in stories) seed them without a full hydrate. */
export async function ensureFavorites(): Promise<void> {
  if ($ready.get()) return;
  const [p, f] = await Promise.all([getApi().getProfile(), getApi().getFavorites()]);
  if (!$ready.get()) {
    $profile.set(p);
    $favorites.set(f);
    $forYou.set(readJson(safeStorage(), FORYOU, false));
  }
}
if (typeof document !== 'undefined') $profile.subscribe(applyAccent);

/** Opens the sheet by itself once, after the first story is read, when the reader has no profile. */
export function maybeNudge(): void {
  if ($profile.get() || onboardingDismissed() || readJson(safeStorage(), NUDGED, false)) return;
  writeJson(safeStorage(), NUDGED, true);
  $sheet.set('onboarding');
}

export function onboardingDismissed(): boolean {
  return readJson(safeStorage(), KEYS.onboarding, false);
}
export function dismissOnboarding(): void {
  writeJson(safeStorage(), KEYS.onboarding, true);
}

let hydrating: Promise<void> | null = null;

export function hydrate(issue: number): Promise<void> {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    const api = getApi();
    const [p, f, pr] = await Promise.all([api.getProfile(), api.getFavorites(), api.getProgress(issue)]);
    $profile.set(p);
    $favorites.set(f);
    $progress.set(pr);
    $forYou.set(readJson(safeStorage(), FORYOU, false));
    $ready.set(true);
    if (typeof document !== 'undefined') $visit.set(await api.visit(issue, document.documentElement.lang || 'ar'));
  })();
  return hydrating;
}

export async function saveProfile(p: Profile): Promise<void> {
  await getApi().saveProfile(p);
  $profile.set(await getApi().getProfile());
}

export async function clearProfile(): Promise<void> {
  await getApi().clearProfile();
  $profile.set(null);
}

export async function saveFavorites(f: Favorites): Promise<void> {
  await getApi().saveFavorites(f);
  $favorites.set(await getApi().getFavorites());
}

export async function togglePinnedSection(id: SectionId): Promise<void> {
  const f = $favorites.get();
  const sections = f.sections.includes(id) ? f.sections.filter((s) => s !== id) : [...f.sections, id].slice(-5);
  await saveFavorites({ ...f, sections });
}

export async function markProgress(issue: number, patch: Partial<IssueProgress>): Promise<void> {
  $progress.set(await getApi().markProgress(issue, patch));
  if (patch.sectionsRead?.length) maybeNudge();
}

export async function resetAll(): Promise<void> {
  await getApi().reset();
  hydrating = null;
  $profile.set(null);
  $favorites.set(EMPTY_FAVORITES);
  $progress.set(null);
}

// Shared types for content, people and the reader's own data.
// Task 3 adds the content types (Story, EventItem, Unit, Person, QaItem).

export type Lang = 'ar' | 'en';
export const LANGS: readonly Lang[] = ['ar', 'en'] as const;

/** Storage keys. The pre-paint theme script in Base.astro reads `theme` directly;
 *  everything else goes through src/lib/api/storage.ts. */
export const KEYS = {
  theme: 'tullabiya:v1:theme',
  lang: 'tullabiya:v1:lang',
  state: 'tullabiya:v1:state',
} as const;

/** Arabic is the source language. English is optional per field. */
export interface Localized {
  ar: string;
  en?: string;
  /** How the English came to be. Machine text is shown with a note until reviewed. */
  enStatus?: 'machine' | 'reviewed';
}

export type CollegeId = 'eng' | 'comp' | 'biz' | 'dbe' | 'chem' | 'pet' | 'gen';

export interface College {
  id: CollegeId;
  name: Localized;
  /** CSS custom property holding the brand's college accent. */
  color: string;
  /** Text color that passes on that accent. */
  ink: 'ink' | 'beige';
}

export const COLLEGES: readonly College[] = [
  { id: 'eng', name: { ar: 'الهندسة والفيزياء', en: 'Engineering & Physics', enStatus: 'reviewed' }, color: 'var(--col-eng)', ink: 'ink' },
  { id: 'comp', name: { ar: 'الحاسب الآلي والرياضيات', en: 'Computing & Mathematics', enStatus: 'reviewed' }, color: 'var(--col-comp)', ink: 'ink' },
  { id: 'biz', name: { ar: 'الأعمال', en: 'Business', enStatus: 'reviewed' }, color: 'var(--col-biz)', ink: 'beige' },
  { id: 'dbe', name: { ar: 'التصميم والبيئة العمرانية', en: 'Design & Built Environment', enStatus: 'reviewed' }, color: 'var(--col-dbe)', ink: 'beige' },
  { id: 'chem', name: { ar: 'الكيمياء والمواد', en: 'Chemicals & Materials', enStatus: 'reviewed' }, color: 'var(--col-chem)', ink: 'ink' },
  { id: 'pet', name: { ar: 'هندسة البترول وعلوم الأرض', en: 'Petroleum Engineering & Geosciences', enStatus: 'reviewed' }, color: 'var(--col-pet)', ink: 'beige' },
  { id: 'gen', name: { ar: 'الدراسات العامة', en: 'General Studies', enStatus: 'reviewed' }, color: 'var(--col-gen)', ink: 'beige' },
] as const;

export function college(id: CollegeId): College {
  const c = COLLEGES.find((x) => x.id === id);
  if (!c) throw new Error(`unknown college: ${id}`);
  return c;
}

/** "Your color": the same seven brand accents the colleges use, chosen by the reader, named by hue. */
export type AccentId = 'orange' | 'aqua' | 'navy' | 'clay' | 'gold' | 'crimson' | 'indigo';

export interface Accent {
  id: AccentId;
  name: Localized;
  color: string;
  ink: 'ink' | 'beige';
}

export const ACCENTS: readonly Accent[] = [
  { id: 'orange', name: { ar: 'برتقالي', en: 'Orange', enStatus: 'reviewed' }, color: 'var(--col-eng)', ink: 'ink' },
  { id: 'aqua', name: { ar: 'فيروزي فاتح', en: 'Aqua', enStatus: 'reviewed' }, color: 'var(--col-comp)', ink: 'ink' },
  { id: 'navy', name: { ar: 'كحلي', en: 'Navy', enStatus: 'reviewed' }, color: 'var(--col-biz)', ink: 'beige' },
  { id: 'clay', name: { ar: 'طيني', en: 'Clay', enStatus: 'reviewed' }, color: 'var(--col-dbe)', ink: 'beige' },
  { id: 'gold', name: { ar: 'ذهبي', en: 'Gold', enStatus: 'reviewed' }, color: 'var(--col-chem)', ink: 'ink' },
  { id: 'crimson', name: { ar: 'قرمزي', en: 'Crimson', enStatus: 'reviewed' }, color: 'var(--col-pet)', ink: 'beige' },
  { id: 'indigo', name: { ar: 'نيلي', en: 'Indigo', enStatus: 'reviewed' }, color: 'var(--col-gen)', ink: 'beige' },
] as const;

export function accent(id: AccentId | undefined): Accent {
  return ACCENTS.find((x) => x.id === id) ?? ACCENTS[0];
}

/** Profiles saved before "your color" carried a college; this maps them to the matching accent. */
export const COLLEGE_ACCENT: Record<CollegeId, AccentId> = { eng: 'orange', comp: 'aqua', biz: 'navy', dbe: 'clay', chem: 'gold', pet: 'crimson', gen: 'indigo' };

export type SectionId = 'news' | 'guest' | 'experience' | 'contributions' | 'last';

export const SECTIONS: readonly { id: SectionId; name: Localized }[] = [
  { id: 'news', name: { ar: 'الأخبار', en: 'News', enStatus: 'reviewed' } },
  { id: 'guest', name: { ar: 'ضيف الثلاثين', en: 'Guest of the 30th', enStatus: 'reviewed' } },
  { id: 'experience', name: { ar: 'تجربتي', en: 'My Experience', enStatus: 'reviewed' } },
  { id: 'contributions', name: { ar: 'مشاركاتي', en: 'My Contributions', enStatus: 'reviewed' } },
  { id: 'last', name: { ar: 'الأخيرة', en: 'The Last Page', enStatus: 'reviewed' } },
] as const;

export const SECTION_IDS: readonly SectionId[] = SECTIONS.map((s) => s.id);

/** How the site addresses the reader in Arabic. */
export type Address = 'neutral' | 'm' | 'f';

export interface Profile {
  name: string;
  /** The reader's accent: avatar, chip, their bars and stamps. */
  color: AccentId;
  address: Address;
  /** Square JPEG data URL, 256px, or absent. */
  avatar?: string;
}

export interface Favorites {
  sections: SectionId[];
  units: string[];
}

export const EMPTY_FAVORITES: Favorites = { sections: [], units: [] };

/* ---------- Content (validated by src/data/schemas.ts) ---------- */

export type EventKind = 'career' | 'culture' | 'national' | 'conference' | 'competition';

export interface EventItem {
  id: string;
  title: Localized;
  description: Localized;
  /** YYYY-MM-DD for all-day events, else ISO datetime with offset. */
  start: string;
  end?: string;
  allDay: boolean;
  colleges: CollegeId[] | 'all';
  unitId: string;
  kind: EventKind;
  place?: Localized;
  /** Shown on the opportunities board. */
  opportunity?: boolean;
}

export interface Unit {
  id: string;
  name: Localized;
  short?: Localized;
  email?: string;
  office?: Localized;
}

export interface Person {
  id: string;
  name: Localized;
  role: Localized;
  college?: CollegeId;
  contactable: boolean;
  photo?: string;
}

export interface StoryStep {
  label: Localized;
  when: Localized;
  note: Localized;
}

export interface Story {
  id: string;
  issue: number;
  section: SectionId;
  slug: string;
  title: Localized;
  summary: Localized;
  body?: { ar: string[]; en?: string[] };
  authorId?: string;
  unitIds: string[];
  peopleIds?: string[];
  eventIds?: string[];
  photo?: string;
  photos?: string[];
  photoAlt?: Localized;
  photoCredit?: Localized;
  pdfPage?: number;
  /** Where the story sits on that page, 0 to 1 from the top-left corner. */
  pdfRegion?: { x: number; y: number; w: number; h: number };
  readingMinutes: number;
  /** A YouTube video in place of the photo. */
  video?: { youtube: string; minutes?: number };
  steps?: StoryStep[];
  quote?: Localized;
}

export interface QaItem {
  id: string;
  guestId: string;
  q: Localized;
  a: Localized;
}

export interface Issue {
  number: number;
  /** First day of the issue's month. */
  date: string;
  year: number;
  month: number;
  coverLine: Localized;
  coverPhoto: string;
  coverAlt: Localized;
  coverCredit?: Localized;
  pages: number;
  leadStoryId: string;
  guestId: string;
  pdf: string;
  storyIds: string[];
}

export interface PollOption {
  id: string;
  label: Localized;
}

export interface Poll {
  id: string;
  issue: number;
  kind: 'fun' | 'useful' | 'serious';
  question: Localized;
  lead?: Localized;
  options: PollOption[];
  /** Simulated starting counts per option id. */
  seed: Record<string, number>;
  seedByCollege?: Partial<Record<CollegeId, Record<string, number>>>;
  guestPick?: string;
  answer?: Localized;
  sample: true;
}

export interface HuntClue {
  text: Localized;
  photo?: string;
}

export interface Hunt {
  id: string;
  issue: number;
  riddle: Localized;
  clues: HuntClue[];
  answers: string[];
  closesAt: string;
  prize: Localized;
  firstSeats: number;
  drawSeats: number;
  seedTaken: number;
  sample: true;
}

export interface Community {
  questions: { id: string; text: Localized; votes: number }[];
  kudos: { id: string; to: Localized; text: Localized }[];
  captionPhoto: string;
  captionAlt: Localized;
  previousCaptions: { text: Localized; by: Localized }[];
  sample: true;
}

export interface ArchiveEntry {
  number: number;
  pages: number;
  month?: string;
  coverLine?: Localized;
  local?: boolean;
}

/** A place to collect the printed issue. Only what the Deanship has confirmed is filled in. */
export interface PickupPoint {
  id: string;
  name: Localized;
  room?: Localized;
  hours?: Localized;
  mapUrl?: string;
}

export interface ContentBundle {
  issues: Issue[];
  stories: Story[];
  events: EventItem[];
  units: Unit[];
  people: Person[];
  qa: QaItem[];
  polls: Poll[];
  hunts: Hunt[];
  community: Community;
  archive: ArchiveEntry[];
  pickup: PickupPoint[];
}

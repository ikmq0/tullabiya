// Loads and validates every content file once. Pages import from here (server side only: it reads
// public/archive/ from disk to learn which issues are present).
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  archiveSchema, communitySchema, eventSchema, huntSchema, issueSchema, personSchema, pickupSchema, pollSchema, qaSchema,
  storySchema, unitSchema,
} from './schemas';
import type {
  ArchiveEntry, Community, ContentBundle, EventItem, Hunt, Issue, Person, PickupPoint, Poll, QaItem, Story, Unit,
} from '~/lib/model';

import issue21 from './issues/21.json';
import events from './events.json';
import units from './units.json';
import people from './people.json';
import qa from './qa.json';
import polls from './polls.json';
import hunts from './hunts.json';
import community from './community.json';
import archive from './archive.json';
import pickup from './pickup.json';

const storyModules = import.meta.glob('./stories/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

let cache: ContentBundle | null = null;

/** The project root: the nearest ancestor of this module holding astro.config.mjs, which is the same
 *  answer from src/ in dev, from dist/ chunks during the build, and under Vitest, whatever the cwd. */
function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'astro.config.mjs'))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

/** An issue is local when its rendered pages sit under public/archive/<n>/ (git-ignored except
 *  issue 21; `scripts/ingest_archive.py` fetches the rest). The JSON values are the fallback. */
export function onDisk(entry: ArchiveEntry, root = projectRoot()): ArchiveEntry {
  const dir = resolve(root, 'public', 'archive', String(entry.number));
  if (!existsSync(resolve(dir, 'cover.jpg'))) return { ...entry, local: false };
  const pages = readdirSync(dir).filter((f) => /^p\d{2,3}\.jpg$/.test(f)).length;
  return { ...entry, local: pages > 0, pages: pages || entry.pages };
}

export function loadAll(): ContentBundle {
  if (cache) return cache;
  const stories = Object.keys(storyModules)
    .sort()
    .map((k) => storySchema.parse(storyModules[k]) as Story);
  const bundle: ContentBundle = {
    issues: [issueSchema.parse(issue21) as Issue],
    stories,
    events: z.array(eventSchema).parse(events) as EventItem[],
    units: z.array(unitSchema).parse(units) as Unit[],
    people: z.array(personSchema).parse(people) as Person[],
    qa: z.array(qaSchema).parse(qa) as QaItem[],
    polls: z.array(pollSchema).parse(polls) as Poll[],
    hunts: z.array(huntSchema).parse(hunts) as Hunt[],
    community: communitySchema.parse(community) as Community,
    archive: (archiveSchema.parse(archive) as ArchiveEntry[]).map((a) => onDisk(a)),
    pickup: pickupSchema.parse(pickup) as PickupPoint[],
  };
  validateRefs(bundle);
  cache = bundle;
  return bundle;
}

function validateRefs(b: ContentBundle): void {
  const unitIds = new Set(b.units.map((u) => u.id));
  const peopleIds = new Set(b.people.map((p) => p.id));
  const eventIds = new Set(b.events.map((e) => e.id));
  const storyIds = new Set<string>();
  for (const s of b.stories) {
    if (storyIds.has(s.id)) throw new Error(`duplicate story id ${s.id}`);
    storyIds.add(s.id);
    if (s.pdfRegion && !s.pdfPage) throw new Error(`story ${s.id}: a region needs a printed page`);
    if (s.authorId && !peopleIds.has(s.authorId)) throw new Error(`story ${s.id}: unknown author ${s.authorId}`);
    for (const u of s.unitIds) if (!unitIds.has(u)) throw new Error(`story ${s.id}: unknown unit ${u}`);
    for (const p of s.peopleIds ?? []) if (!peopleIds.has(p)) throw new Error(`story ${s.id}: unknown person ${p}`);
    for (const e of s.eventIds ?? []) if (!eventIds.has(e)) throw new Error(`story ${s.id}: unknown event ${e}`);
  }
  for (const e of b.events) if (!unitIds.has(e.unitId)) throw new Error(`event ${e.id}: unknown unit ${e.unitId}`);
  for (const q of b.qa) if (!peopleIds.has(q.guestId)) throw new Error(`qa ${q.id}: unknown guest ${q.guestId}`);
  for (const i of b.issues) {
    if (!storyIds.has(i.leadStoryId)) throw new Error(`issue ${i.number}: unknown lead story`);
    if (!peopleIds.has(i.guestId)) throw new Error(`issue ${i.number}: unknown guest`);
    for (const s of i.storyIds) if (!storyIds.has(s)) throw new Error(`issue ${i.number}: unknown story ${s}`);
  }
}

export function currentIssue(): Issue {
  const b = loadAll();
  return b.issues.reduce((a, c) => (c.number > a.number ? c : a));
}

export function storiesOf(issue: number): Story[] {
  const b = loadAll();
  const i = b.issues.find((x) => x.number === issue);
  if (!i) return [];
  const byId = new Map(b.stories.map((s) => [s.id, s]));
  return i.storyIds.map((id) => byId.get(id)!).filter(Boolean);
}

export function storyBySlug(issue: number, slug: string): Story | undefined {
  return loadAll().stories.find((s) => s.issue === issue && s.slug === slug);
}

export function unitById(id: string): Unit {
  const u = loadAll().units.find((x) => x.id === id);
  if (!u) throw new Error(`unknown unit ${id}`);
  return u;
}

export function personById(id: string): Person {
  const p = loadAll().people.find((x) => x.id === id);
  if (!p) throw new Error(`unknown person ${id}`);
  return p;
}

export function eventById(id: string): EventItem {
  const e = loadAll().events.find((x) => x.id === id);
  if (!e) throw new Error(`unknown event ${id}`);
  return e;
}

export function eventsInMonth(year: number, month: number): EventItem[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return loadAll()
    .events.filter((e) => e.start.startsWith(prefix))
    .sort((a, b) => a.start.localeCompare(b.start));
}

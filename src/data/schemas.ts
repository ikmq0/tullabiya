// Zod schemas for the content JSON. Arabic is required; English optional and labelled.
import { z } from 'zod';

export const localized = z.object({
  ar: z.string().min(1),
  en: z.string().min(1).optional(),
  enStatus: z.enum(['machine', 'reviewed']).optional(),
}).refine((v) => !v.en || !!v.enStatus, { message: 'en requires enStatus' });

export const collegeId = z.enum(['eng', 'comp', 'biz', 'dbe', 'chem', 'pet', 'gen']);
export const sectionId = z.enum(['news', 'guest', 'experience', 'contributions', 'last']);
export const eventKind = z.enum(['career', 'culture', 'national', 'conference', 'competition']);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const isoDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/, 'ISO datetime with offset');

export const unitSchema = z.object({
  id: z.string(),
  name: localized,
  short: localized.optional(),
  email: z.email().optional(),
  office: localized.optional(),
});

export const personSchema = z.object({
  id: z.string(),
  name: localized,
  role: localized,
  college: collegeId.optional(),
  contactable: z.boolean(),
  photo: z.string().optional(),
});

export const eventSchema = z.object({
  id: z.string(),
  title: localized,
  description: localized,
  start: z.union([isoDate, isoDateTime]),
  end: z.union([isoDate, isoDateTime]).optional(),
  allDay: z.boolean(),
  colleges: z.union([z.literal('all'), z.array(collegeId).min(1)]),
  unitId: z.string(),
  kind: eventKind,
  place: localized.optional(),
  opportunity: z.boolean().optional(),
});

export const storySchema = z.object({
  id: z.string(),
  issue: z.number().int().positive(),
  section: sectionId,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: localized,
  summary: localized,
  body: z.object({ ar: z.array(z.string().min(1)).min(1), en: z.array(z.string().min(1)).optional() }).optional(),
  authorId: z.string().optional(),
  unitIds: z.array(z.string()),
  peopleIds: z.array(z.string()).optional(),
  eventIds: z.array(z.string()).optional(),
  photo: z.string().optional(),
  photos: z.array(z.string()).optional(),
  photoAlt: localized.optional(),
  photoCredit: localized.optional(),
  /** Page in the printed issue; absent for web-only stories such as videos. */
  pdfPage: z.number().int().positive().optional(),
  readingMinutes: z.number().int().positive(),
  video: z.object({ youtube: z.string().regex(/^[\w-]{11}$/), minutes: z.number().int().positive().optional() }).optional(),
  steps: z.array(z.object({ label: localized, when: localized, note: localized })).optional(),
  quote: localized.optional(),
});

export const qaSchema = z.object({
  id: z.string(),
  guestId: z.string(),
  q: localized,
  a: localized,
});

export const issueSchema = z.object({
  number: z.number().int().positive(),
  date: isoDate,
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  coverLine: localized,
  coverPhoto: z.string(),
  coverAlt: localized,
  coverCredit: localized.optional(),
  pages: z.number().int().positive(),
  leadStoryId: z.string(),
  guestId: z.string(),
  pdf: z.string(),
  storyIds: z.array(z.string()).min(1),
});

export const pollSchema = z.object({
  id: z.string(),
  issue: z.number().int().positive(),
  kind: z.enum(['fun', 'useful', 'serious']),
  question: localized,
  lead: localized.optional(),
  options: z.array(z.object({ id: z.string(), label: localized })).min(2),
  seed: z.record(z.string(), z.number().int().nonnegative()),
  seedByCollege: z.record(collegeId, z.record(z.string(), z.number().int().nonnegative())).optional(),
  guestPick: z.string().optional(),
  answer: localized.optional(),
  sample: z.literal(true),
});

export const huntSchema = z.object({
  id: z.string(),
  issue: z.number().int().positive(),
  riddle: localized,
  clues: z.array(z.object({ text: localized, photo: z.string().optional() })).min(1),
  answers: z.array(z.string().min(1)).min(1),
  closesAt: isoDateTime,
  prize: localized,
  firstSeats: z.number().int().positive(),
  drawSeats: z.number().int().nonnegative(),
  seedTaken: z.number().int().nonnegative(),
  sample: z.literal(true),
});

export const communitySchema = z.object({
  questions: z.array(z.object({ id: z.string(), text: localized, votes: z.number().int().nonnegative() })),
  kudos: z.array(z.object({ id: z.string(), to: localized, text: localized })),
  captionPhoto: z.string(),
  captionAlt: localized,
  previousCaptions: z.array(z.object({ text: localized, by: localized })),
  sample: z.literal(true),
});

export const archiveSchema = z.array(
  z.object({
    number: z.number().int().positive(),
    pages: z.number().int().nonnegative(),
    month: isoDate.optional(),
    coverLine: localized.optional(),
    local: z.boolean().optional(),
  }),
);

export type UnitIn = z.infer<typeof unitSchema>;
export type PersonIn = z.infer<typeof personSchema>;
export type EventIn = z.infer<typeof eventSchema>;
export type StoryIn = z.infer<typeof storySchema>;
export type QaIn = z.infer<typeof qaSchema>;
export type IssueIn = z.infer<typeof issueSchema>;
export type PollIn = z.infer<typeof pollSchema>;
export type HuntIn = z.infer<typeof huntSchema>;
export type CommunityIn = z.infer<typeof communitySchema>;
export type ArchiveIn = z.infer<typeof archiveSchema>;

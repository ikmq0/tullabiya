import { describe, it, expect } from 'vitest';
import { loadAll, currentIssue, storiesOf, eventsInMonth } from '~/data';
import { pickupSchema, storySchema } from '~/data/schemas';
import { SECTION_IDS, type PickupPoint } from '~/lib/model';

const b = loadAll();

describe('content bundle', () => {
  it('parses every file and resolves every reference', () => {
    expect(b.stories.length).toBeGreaterThanOrEqual(16);
    expect(b.qa.length).toBe(30);
    expect(currentIssue().number).toBe(21);
    expect(storiesOf(21).length).toBe(currentIssue().storyIds.length);
  });

  it('every story section is a known section and ids are unique', () => {
    for (const s of b.stories) expect(SECTION_IDS).toContain(s.section);
    expect(new Set(b.stories.map((s) => s.id)).size).toBe(b.stories.length);
    expect(new Set(b.stories.map((s) => `${s.issue}/${s.slug}`)).size).toBe(b.stories.length);
  });

  it('all events fall in September 2026', () => {
    for (const e of b.events) {
      expect(e.start >= '2026-09-01' && e.start <= '2026-09-30').toBe(true);
      if (e.end) expect(e.end >= e.start).toBe(true);
    }
    expect(eventsInMonth(2026, 9).length).toBe(b.events.length);
  });

  it('contains exactly the printed calendar', () => {
    const got = b.events.map((e) => [e.start.slice(8), e.title.ar]).sort();
    expect(got).toEqual(
      [
        ['01', 'برنامج Career Talks'],
        ['01', 'مؤتمر SRC 2026'],
        ['13', 'مسابقة The Stage @ KFUPM'],
        ['15', 'BCG في الحرم الجامعي'],
        ['23', 'افتتاح كأس الخليج 27'],
        ['23', 'اليوم الوطني السعودي: عزنا بطبعنا'],
        ['29', 'برنامج Career Talks'],
      ].sort(),
    );
    const src = b.events.find((e) => e.id === 'src-2026')!;
    expect(src.end).toBe('2026-09-02');
  });

  it('BCG is an all-day event on Tuesday 15 September', () => {
    const bcg = b.events.find((e) => e.id === 'bcg-2026-09-15')!;
    expect(bcg.allDay).toBe(true);
    expect(bcg.start).toBe('2026-09-15');
    expect(new Date('2026-09-15T12:00:00+03:00').getUTCDay()).toBe(2);
  });

  it('every English value carries an enStatus', () => {
    const walk = (v: unknown, path: string) => {
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (typeof o.ar === 'string' && typeof o.en === 'string') {
          expect(o.enStatus, path).toMatch(/machine|reviewed/);
        }
        for (const [k, x] of Object.entries(o)) walk(x, `${path}.${k}`);
      }
    };
    walk(b, 'bundle');
  });

  it('every photo key referenced exists in the assets folder', async () => {
    const { readdirSync } = await import('node:fs');
    const keys = new Set(readdirSync(new URL('../../src/assets/issue21/', import.meta.url)).map((f) => f.replace(/\.jpg$/, '')));
    const refs: string[] = [];
    for (const s of b.stories) {
      if (s.photo) refs.push(s.photo);
      for (const p of s.photos ?? []) refs.push(p);
    }
    for (const i of b.issues) refs.push(i.coverPhoto);
    for (const h of b.hunts) for (const c of h.clues) if (c.photo) refs.push(c.photo);
    refs.push(b.community.captionPhoto);
    for (const r of refs) expect(keys.has(r), r).toBe(true);
  });

  it('sample interaction data is labelled', () => {
    for (const p of b.polls) expect(p.sample).toBe(true);
    for (const h of b.hunts) expect(h.sample).toBe(true);
    expect(b.community.sample).toBe(true);
  });
});

describe('story regions', () => {
  it('every printed story in issue 21 has one, and the web-only story does not', () => {
    for (const s of storiesOf(21)) {
      if (s.pdfPage) expect(s.pdfRegion, s.id).toBeDefined();
      else expect(s.pdfRegion, s.id).toBeUndefined();
    }
  });
  it('stays on the page with a positive size', () => {
    for (const s of b.stories) {
      if (!s.pdfRegion) continue;
      const { x, y, w, h } = s.pdfRegion;
      expect(s.pdfPage, s.id).toBeGreaterThan(0);
      expect(w, s.id).toBeGreaterThan(0);
      expect(h, s.id).toBeGreaterThan(0);
      expect(x, s.id).toBeGreaterThanOrEqual(0);
      expect(y, s.id).toBeGreaterThanOrEqual(0);
      expect(x + w, s.id).toBeLessThanOrEqual(1.0001);
      expect(y + h, s.id).toBeLessThanOrEqual(1.0001);
    }
  });
  it('rejects a region that runs off the page', () => {
    const base = b.stories.find((s) => s.pdfRegion)!;
    expect(storySchema.safeParse({ ...base, pdfRegion: { x: 0.9, y: 0, w: 0.5, h: 0.1 } }).success).toBe(false);
    expect(storySchema.safeParse({ ...base, pdfRegion: { x: 0, y: 0, w: 0, h: 0.1 } }).success).toBe(false);
  });
});

describe('hard copy pickup', () => {
  it('holds the one point the owner confirmed, in both languages', () => {
    expect(b.pickup.map((p) => p.id)).toEqual(['building-68']);
    const [p] = b.pickup;
    expect(p.name.ar).toBe('مبنى 68، جامعة الملك فهد للبترول والمعادن');
    expect(p.name.en).toBe('Building 68, KFUPM');
  });

  it('records the hours the owner confirmed: anytime', () => {
    expect(b.pickup[0].hours?.ar).toBe('في أي وقت');
    expect(b.pickup[0].hours?.en).toBe('Anytime');
  });

  // Room and map link are not known. When the Deanship confirms them, fill them in and update this test;
  // until then it keeps anything invented out of the file.
  it('leaves the unknown fields out, and is real data rather than a sample', () => {
    const [p] = b.pickup as (PickupPoint & { sample?: boolean })[];
    expect(p.room).toBeUndefined();
    expect(p.mapUrl).toBeUndefined();
    expect(p.sample).toBeUndefined();
  });

  it('accepts the optional fields and rejects anything else, such as a stock count', () => {
    const name = { ar: 'مبنى' };
    expect(pickupSchema.safeParse([{ id: 'a', name, room: { ar: 'غرفة' }, hours: { ar: 'صباحاً' }, mapUrl: 'https://maps.test/x' }]).success).toBe(true);
    expect(pickupSchema.safeParse([{ id: 'a', name, stock: 40 }]).success).toBe(false);
    expect(pickupSchema.safeParse([{ id: 'a', name, mapUrl: 'not a url' }]).success).toBe(false);
    expect(pickupSchema.safeParse([]).success).toBe(false);
  });
});

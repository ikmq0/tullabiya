# الطلّابية Interactive

The monthly magazine of the KFUPM Deanship of Student Affairs as an interactive, bilingual
(Arabic RTL first, English LTR), mobile-first website. This is the front-end prototype: every
page works, every interaction is real in the browser, and all reader data stays on the device
behind one `Api` seam that a real backend will replace.

## Run

```bash
npm install
npx playwright install chromium   # once, for the e2e suite
npm run dev                       # http://127.0.0.1:4321
npm run build && npm run preview  # the built site, with the search index
npm run check                     # type check, unit, e2e, performance budget
```

Node 22.23+ is required. `python scripts/render_pages.py` and `scripts/ingest_archive.py` need
Python 3 with PyMuPDF (`pip install pymupdf`).

Demo switches (query parameters): `?now=2026-09-18` moves the prototype clock (the hunt closes on
the 20th), `?today=2026-09-16` moves the month strip's "today", `?demo=1` adds three sample
students to the profile menu.

## Where things are

```
src/data/            content as JSON (Arabic source, optional English with enStatus), validated by zod
  issues/21.json     the issue: cover, lead story, guest, story order
  stories/*.json     one file per story (title, summary, body, author, units, photo, printed page)
  events.json        the month's calendar; colleges: 'all' or a list; opportunity: true for the board
  polls.json hunts.json community.json   sample interaction data (every file carries sample: true)
  archive.json       the 22 issues (number, month, cover line); whether an issue is local and its
                     page count are read from public/archive/<n>/ at build time
src/i18n/            ui.ar.json / ui.en.json (identical key sets), plurals, dates, gendered variants
src/lib/api/         Api.ts (the seam), LocalApi.ts (the simulation), storage.ts (never throws)
src/lib/             entities, ics, poll, hunt, strip, calendarGrid, shareCard, personalization, clock
src/components/      Astro sections; islands/ are the Preact parts that need a browser
src/pages/[lang]/    index, calendar, opportunities, community, my, archive/, issue/[n]/[slug]
src/styles/          tokens (brand hexes only), fonts, base, fast shapes, popovers, components
tests/unit           Vitest; tests/e2e Playwright (desktop 1440 and phone 390 projects)
scripts/             render_pages.py, ingest_archive.py, check-budget.mjs
docs/                the design spec, the implementation plan, handoff.md, reference/mockup
```

## Publishing a new issue

1. Add `src/data/issues/<n>.json` and one `src/data/stories/<n>-*.json` per story. Arabic is
   required; English is optional and must carry `enStatus: "machine"` or `"reviewed"`.
2. Add the month's events to `events.json`, the polls to `polls.json`, the hunt to `hunts.json`.
3. Put the PDF at `public/archive/<n>/issue.pdf` and run
   `python scripts/render_pages.py public/archive/<n>/issue.pdf public/archive/<n>`.
   Add the issue's number, month and cover line to `archive.json`; the build finds the pages itself.
   `public/archive/` is git-ignored except issue 21: after cloning, run `python scripts/ingest_archive.py`
   to fetch and render the other issues from the Deanship site.
4. Photos go in `src/assets/issue<n>/` and are referenced by file name without extension.
5. `npm run check`. The content test fails on any dangling reference.

`currentIssue()` is the highest issue number; the previous one moves to the archive by itself.

## Replacing the simulated backend

Implement `Api` (`src/lib/api/Api.ts`) over HTTP and call `setApi()` once at startup. The
contract tests in `tests/unit/api.contract.test.ts` are written to run against any implementation.
Identity (KFUPM SSO), delivery (email, WhatsApp, X), moderation and the real clock are outside
the prototype; `docs/handoff.md` lists them.

## Fonts and licences

KFUPM Display is the university's own typeface (brand guide 7.1). IBM Plex Sans Arabic is under
the SIL Open Font License, see `public/fonts/OFL-IBMPlex.txt`.

## Added in batch 1 (3 Nov 2026)

`src/pages/[lang]/quick.astro` (the 5-minute version), `EditionRail`, `FavoritesBand` with items and the
`ForYouToggle`/`ForYouFilter` chips (`src/lib/foryou.ts`), `LiteVideo`, `StampToast` and `src/lib/stamps.ts`,
weekly clue drops in `src/lib/hunt.ts`, and `LocalApi.visit` for "since your last visit". The profile
carries a color instead of a college. See `docs/handoff.md` for the sample content these use.

// The house rules, enforced: no gradients, glass, monospace, tracked caps, hairlines,
// resting shadows, or physical left/right outside clip-path and transform lines.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../src/', import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|astro|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const banned: { re: RegExp; why: string; allow?: (file: string, line: string) => boolean }[] = [
  { re: /gradient\(/, why: 'gradients' },
  { re: /backdrop-filter/, why: 'glass' },
  { re: /monospace/, why: 'monospace' },
  { re: /text-transform:\s*uppercase/, why: 'tracked caps' },
  { re: /border(-block|-inline)?(-start|-end|-top|-bottom)?:\s*1px/, why: 'hairline borders' },
  {
    re: /box-shadow/,
    why: 'resting shadow',
    allow: (file) => /popover\.css$/.test(file) || /components\.css$/.test(file),
  },
  {
    re: /(^|[^-\w])(margin|padding)-(left|right)\s*:|(^|[^-\w])(left|right)\s*:/,
    why: 'physical left/right',
    allow: (_f, line) => /clip-path|transform|\/\*|\/\//.test(line),
  },
];

describe('style rules', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(10);
  });
  for (const b of banned) {
    it(`has no ${b.why}`, () => {
      const hits: string[] = [];
      for (const f of files) {
        const lines = readFileSync(f, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (b.re.test(line) && !(b.allow && b.allow(f, line))) hits.push(`${f.replace(ROOT, '')}:${i + 1}: ${line.trim()}`);
        });
      }
      expect(hits).toEqual([]);
    });
  }
  it('allows at most one box-shadow in components.css (the sheet)', () => {
    const css = readFileSync(join(ROOT, 'styles/components.css'), 'utf8');
    expect((css.match(/box-shadow/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});

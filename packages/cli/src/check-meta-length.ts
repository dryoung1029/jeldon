import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { loadDomainPack, type SeoConfig } from '@jeldon/config';

/**
 * Title/description length gate for hand-coded pages. Ported from BoH
 * `scripts/check-meta-length.mjs` (2026-07-09): articles are scored by
 * `@jeldon/core-scoring`, but static pages hardcode `const title` /
 * `const description` in each `.astro` file with nothing checking them, and a
 * 349-character description sat truncated in search results for months.
 *
 * Thresholds are `scoring.seo.title` / `scoring.seo.excerpt`, the same bar the
 * article scorer uses. An HTML entity in either literal is always an error:
 * Astro escapes the string on render, so `&amp;` shows up as visible text.
 */

export interface MetaIssue {
  file: string;
  field: 'title' | 'description';
  level: 'error' | 'warning';
  message: string;
}

export interface MetaLengthReport {
  files: number;
  errors: MetaIssue[];
  warnings: MetaIssue[];
  ok: boolean;
}

const ENTITY_RE = /&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…' };

function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[ent] ?? m;
  });
}

/** `const <name> = '...'` / `"..."`, closing quote matching the opening one. */
function readConst(raw: string, name: string): string | undefined {
  const m = raw.match(new RegExp(`^\\s*const ${name} = (['"\`])(.*)\\1;?\\s*$`, 'm'));
  return m ? m[2] : undefined;
}

function classify(len: number, good: [number, number], meh: [number, number]): 'good' | 'meh' | 'bad' {
  if (len >= good[0] && len <= good[1]) return 'good';
  if (len >= meh[0] && len <= meh[1]) return 'meh';
  return 'bad';
}

/** Pure check of one file's source. Files with neither constant are skipped. */
export function checkMetaLiterals(file: string, raw: string, seo: Pick<SeoConfig, 'title' | 'excerpt'>): MetaIssue[] {
  const issues: MetaIssue[] = [];
  const fields: Array<['title' | 'description', [number, number], [number, number]]> = [
    ['title', seo.title.good, [1, seo.title.mehMax]],
    ['description', seo.excerpt.good, seo.excerpt.meh],
  ];
  for (const [field, good, meh] of fields) {
    const value = readConst(raw, field);
    if (value === undefined) continue;
    if (ENTITY_RE.test(value)) {
      issues.push({
        file,
        field,
        level: 'error',
        message: `${field} contains an HTML entity ("${value}"). Astro escapes this string on render, so the entity shows as visible text. Use the plain character.`,
      });
    }
    const text = decodeEntities(value);
    const status = classify(text.length, good, meh);
    if (status === 'good') continue;
    const preview = field === 'description' ? `${text.slice(0, 60)}…` : text;
    issues.push({
      file,
      field,
      level: status === 'bad' ? 'error' : 'warning',
      message: `${field} is ${text.length} chars (target ${good[0]}-${good[1]}, ceiling ${meh[1]}): "${preview}"`,
    });
  }
  return issues;
}

async function listPages(dir: string, exclude: Set<string>): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (exclude.has(e)) continue;
    const full = join(dir, e);
    const st = await stat(full);
    if (st.isDirectory()) out.push(...(await listPages(full, exclude)));
    else if (e.endsWith('.astro')) out.push(full);
  }
  return out;
}

export interface RunCheckMetaLengthOptions {
  cwd?: string;
  /** Check only these files (CI passes changed files). Default: scan the roots. */
  files?: string[];
}

export async function runCheckMetaLength(opts: RunCheckMetaLengthOptions = {}): Promise<MetaLengthReport> {
  const cwd = opts.cwd ?? process.cwd();
  const pack = await loadDomainPack({ cwd });
  const seo = pack.scoring.seo;
  const roots = seo.staticPages?.roots ?? ['src/pages'];
  const exclude = new Set(seo.staticPages?.exclude ?? ['admin', 'api', 'preview']);

  let files: string[];
  if (opts.files?.length) {
    files = opts.files
      .filter((f) => f.endsWith('.astro'))
      .map((f) => join(cwd, f))
      .filter((f) => !relative(cwd, f).split(sep).some((part) => exclude.has(part)));
  } else {
    files = (await Promise.all(roots.map((r) => listPages(join(cwd, r), exclude)))).flat();
  }

  const issues: MetaIssue[] = [];
  for (const f of files) issues.push(...checkMetaLiterals(relative(cwd, f), await readFile(f, 'utf8'), seo));
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  return { files: files.length, errors, warnings, ok: errors.length === 0 };
}

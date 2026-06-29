/**
 * The ONE frontmatter codec.
 *
 * BoH had this logic implemented three times — `src/lib/admin/frontmatter.ts`
 * (the rich parser/serializer), the `astro.config.mjs` sitemap-scan filter, and
 * `scripts/publish-scheduled.mjs` (a lossy line-split that read raw string
 * values and re-stringified everything). The publish cron's variant is what
 * caused the `audioBodyLength: "10772"` round-trip bug that killed whole content
 * builds. This module is the single source; `publishScheduled()` and any sitemap
 * filter import it instead of re-implementing.
 *
 * Faithful port of `src/lib/admin/frontmatter.ts`. Supports strings, booleans,
 * numbers, ISO dates (as strings), and string arrays. No YAML dependency — the
 * source kept the Workers bundle small and we preserve that.
 *
 * The codec is value-preserving: unknown frontmatter keys round-trip unchanged,
 * which is how out-of-band writers (audio generation, newsletter automation)
 * can stamp fields the editor never models.
 */

export type FrontmatterValue = string | boolean | number | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

export interface ParsedDoc {
  frontmatter: Frontmatter;
  body: string;
}

const FM_BLOCK_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const FM_LINE_RE = /^([A-Za-z0-9_]+):\s*(.*)$/;

/** Split a raw markdown document into typed frontmatter + body. */
export function parse(raw: string): ParsedDoc {
  const match = raw.match(FM_BLOCK_RE);
  if (!match) return { frontmatter: {}, body: raw };
  const [, fmRaw, body] = match;
  const fm: Frontmatter = {};
  for (const line of (fmRaw ?? '').split(/\r?\n/)) {
    const m = line.match(FM_LINE_RE);
    if (!m) continue;
    const [, key, valRaw] = m;
    if (key === undefined) continue;
    fm[key] = parseValue((valRaw ?? '').trim());
  }
  return { frontmatter: fm, body: body ?? '' };
}

/** Coerce a single raw scalar from the frontmatter source. Exposed so the
 *  publish cron and any other consumer heal numerics identically. */
export function parseValue(v: string): FrontmatterValue {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => unquote(s.trim()));
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  const unq = unquote(v);
  // Heal stringly-quoted numerics produced by earlier round-trips so a numeric
  // schema field stops failing builds. Skip values with leading zeros so we
  // don't silently strip them from zip-code-like values.
  if (/^-?[1-9]\d*(\.\d+)?$/.test(unq) || unq === '0') return Number(unq);
  return unq;
}

function unquote(v: string): string {
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    // Reverse serialize()'s escaping so a value round-trips unchanged instead
    // of accumulating backslashes every save (the docNotes `\\"` bug).
    return unescapeStr(v.slice(1, -1));
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
    return v.slice(1, -1);
  }
  return v;
}

// Symmetric escape/unescape for double-quoted scalars. serialize() must escape
// exactly what unquote() unescapes, or round-trips drift.
function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '').replace(/\n/g, '\\n');
}

function unescapeStr(s: string): string {
  return s.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c));
}

/** Re-emit a parsed document. Numbers/booleans serialize bare; ISO dates and
 *  short lowercase enums stay bare; everything else is double-quoted. */
export function serialize({ frontmatter, body }: ParsedDoc): string {
  const lines: string[] = ['---'];
  for (const [key, val] of Object.entries(frontmatter)) {
    lines.push(`${key}: ${formatValue(val)}`);
  }
  lines.push('---', '');
  return lines.join('\n') + body.replace(/^\n+/, '');
}

function formatValue(v: FrontmatterValue): string {
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map((s) => `"${escapeStr(s)}"`).join(', ')}]`;
  // Bare scalars for ISO dates and category enums; quote everything else.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^[a-z]+$/.test(v) && v.length < 20) return v;
  return `"${escapeStr(v)}"`;
}

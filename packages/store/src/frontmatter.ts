/**
 * Minimal frontmatter parser/serializer used by the store's conflict-merge.
 *
 * Faithful port of Body of Health `src/lib/admin/frontmatter.ts` — supports
 * strings, booleans, numbers (with the stringly-quoted-numeric healing that
 * stops `audioBodyLength: "10772"` from breaking content builds), and string
 * arrays. No YAML lib, so it stays Workers-bundle-small and isomorphic.
 *
 * This is only the DEFAULT codec. A project may inject its own `FrontmatterCodec`
 * (e.g. a real YAML lib) into `GitHubStore`/`FsStore` — the store merges through
 * the interface, not this file.
 */

import type { FrontmatterCodec } from './types.js';

type FmValue = string | boolean | number | string[];

function unescapeStr(s: string): string {
  return s.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c));
}

function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '').replace(/\n/g, '\\n');
}

function unquote(v: string): string {
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    // Double-quoted: reverse serialize()'s escaping so a value round-trips
    // unchanged instead of accumulating backslashes (the docNotes \\" bug).
    return unescapeStr(v.slice(1, -1));
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
    return v.slice(1, -1);
  }
  return v;
}

function parseValue(v: string): FmValue {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => unquote(s.trim()));
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  const unq = unquote(v);
  // Heal stringly-quoted numerics produced by earlier round-trips. Skip values
  // with leading zeros so zip-code-style strings aren't silently mangled.
  if (/^-?[1-9]\d*(\.\d+)?$/.test(unq) || unq === '0') return Number(unq);
  return unq;
}

function formatValue(v: FmValue): string {
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map((s) => `"${escapeStr(String(s))}"`).join(', ')}]`;
  // Bare scalars for ISO dates and short lowercase enums; quote everything else.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^[a-z]+$/.test(v) && v.length < 20) return v;
  return `"${escapeStr(v)}"`;
}

export const defaultFrontmatterCodec: FrontmatterCodec = {
  parse(raw: string) {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: raw };
    const [, fmRaw, body] = match;
    const fm: Record<string, unknown> = {};
    for (const line of (fmRaw ?? '').split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (!m) continue;
      const key = m[1] as string;
      const valRaw = m[2] as string;
      fm[key] = parseValue(valRaw.trim());
    }
    return { frontmatter: fm, body: body ?? '' };
  },

  serialize({ frontmatter, body }) {
    const lines: string[] = ['---'];
    for (const [key, val] of Object.entries(frontmatter)) {
      lines.push(`${key}: ${formatValue(val as FmValue)}`);
    }
    lines.push('---', '');
    return lines.join('\n') + body.replace(/^\n+/, '');
  },
};

/**
 * Lightweight frontmatter helpers for the drafting flow.
 *
 * `defaultDraftFrontmatterCodec` is the crude parser BoH `author.ts` used to
 * read title/excerpt/tags/hero off a fresh draft for scoring — it does NOT
 * need full YAML coverage (those four fields are all the scorer reads).
 *
 * `forcePublishDate` + `mergePreservingFrontmatter` are ported from
 * `author.ts::forcePublishDate` and `chat.ts::mergePreservingFrontmatter`. The
 * merge takes a full frontmatter codec (inject `@jeldon/store`'s
 * `defaultFrontmatterCodec` for real round-trip fidelity) so a model that drops
 * a field (heroImage, audioUrl) doesn't lose it silently.
 */

import type { DraftFrontmatterCodec, ParsedFrontmatter } from './types.js';

/** Crude frontmatter parse tailored to the shape the drafting prompts emit.
 *  Ported from BoH `author.ts::parseFrontmatter`. */
export const defaultDraftFrontmatterCodec: DraftFrontmatterCodec = {
  parse(markdown: string): ParsedFrontmatter {
    const m = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!m) return { title: '', excerpt: '', tags: [], body: markdown };
    const fm = m[1] ?? '';
    const body = m[2] ?? '';
    const get = (key: string): string => {
      const line = fm.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
      if (!line || line[1] === undefined) return '';
      return line[1].trim().replace(/^["']|["']$/g, '');
    };
    const tagsLine = get('tags');
    const tags: string[] = tagsLine.startsWith('[')
      ? (tagsLine.match(/"([^"]+)"|'([^']+)'/g) || []).map((q) => q.slice(1, -1))
      : [];
    return {
      title: get('title'),
      excerpt: get('excerpt'),
      tags,
      heroImage: get('heroImage') || undefined,
      heroImageAlt: get('heroImageAlt') || undefined,
      body,
    };
  },
};

/**
 * Force `publishDate:` to today's ISO date on a generated draft. The model's
 * knowledge cutoff means "today" hallucinates without help. Matches
 * `publishDate:` on its own line (quoted or unquoted). BoH
 * `author.ts::forcePublishDate`.
 */
export function forcePublishDate(content: string, isoDate: string): string {
  const re = /^publishDate:\s*['"]?[^'"\n]*['"]?\s*$/m;
  return re.test(content) ? content.replace(re, `publishDate: ${isoDate}`) : content;
}

/**
 * Merge a model's output with existing markdown so any frontmatter field the
 * model omitted is recovered. Model wins on fields it set; existing wins on
 * fields the model didn't emit. BoH `chat.ts::mergePreservingFrontmatter`.
 *
 * Requires a full frontmatter codec (parse + serialize) — pass
 * `@jeldon/store`'s `defaultFrontmatterCodec`. When omitted, returns the
 * model output unchanged (no merge possible without a serializer).
 */
export function mergePreservingFrontmatter(
  existing: string,
  fromModel: string,
  codec?: {
    parse(raw: string): { frontmatter: Record<string, unknown>; body: string };
    serialize(doc: { frontmatter: Record<string, unknown>; body: string }): string;
  },
): string {
  if (!existing || !codec) return fromModel;
  const e = codec.parse(existing);
  const m = codec.parse(fromModel);
  if (Object.keys(m.frontmatter).length === 0) return fromModel;
  return codec.serialize({
    frontmatter: { ...e.frontmatter, ...m.frontmatter },
    body: m.body,
  });
}

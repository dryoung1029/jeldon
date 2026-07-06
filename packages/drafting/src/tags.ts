/**
 * Controlled-vocabulary tag selection for generated drafts.
 *
 * The drafting prompt asks the model to choose tags from `content.tags` (the
 * Domain Pack's curated vocabulary), but a model can under-deliver, over-deliver,
 * or invent off-vocabulary tags. `reconcileTags` is the deterministic backstop
 * that runs in the draft loop before scoring: it keeps the model's in-vocabulary
 * choices, drops invented ones, backfills by relevance to reach the SEO band
 * minimum, and clamps to the band maximum — so every draft lands in the
 * `scoring.seo.tags` "good" window and the site taxonomy stays consistent.
 *
 * No fabrication: backfill tags come only from the curated vocabulary. Nothing
 * here is domain-specific — the vocabulary and the band are both read from the
 * pack.
 */

import { fmScalar, splitFrontmatter } from './fm-lite.js';
import type { DraftingPack } from './types.js';

/** Lowercase alphanumeric word tokens, for relevance matching. */
function tokenize(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * Deterministically pick the final tag set from a controlled vocabulary.
 *
 * 1. Keep the model's tags that exist in the vocabulary (case-insensitive,
 *    normalized to the vocabulary's spelling). When the vocabulary is empty,
 *    keep the model's tags verbatim — graceful free-form fallback.
 * 2. If still below `band.min`, backfill from the vocabulary by relevance to
 *    `text` (count of vocab-term word hits), ties broken by vocabulary order so
 *    the result is stable.
 * 3. Clamp to `band.max`.
 */
export function selectTags(
  modelTags: string[],
  vocab: string[],
  text: string,
  band: { min: number; max: number },
): string[] {
  const norm = (t: string) => t.trim().toLowerCase();
  const vocabByKey = new Map(vocab.map((v) => [norm(v), v.trim()]));
  const seen = new Set<string>();
  const chosen: string[] = [];

  const add = (display: string) => {
    const key = norm(display);
    if (!key || seen.has(key)) return;
    seen.add(key);
    chosen.push(display.trim());
  };

  // 1. Model's in-vocabulary choices (or verbatim when no vocabulary is set).
  for (const t of modelTags) {
    const key = norm(t);
    if (!key) continue;
    if (vocabByKey.size === 0) add(t);
    else if (vocabByKey.has(key)) add(vocabByKey.get(key)!);
  }

  // 2. Backfill from the vocabulary by relevance until the band minimum is met.
  if (chosen.length < band.min && vocabByKey.size > 0) {
    const haystack = ` ${tokenize(text).join(' ')} `;
    const ranked = vocab
      .map((v, i) => ({ v: v.trim(), i }))
      .filter(({ v }) => !seen.has(norm(v)))
      .map(({ v, i }) => {
        const hits = tokenize(v).reduce((n, w) => n + (haystack.includes(` ${w} `) ? 1 : 0), 0);
        return { v, hits, i };
      })
      .sort((a, b) => b.hits - a.hits || a.i - b.i);
    for (const { v } of ranked) {
      if (chosen.length >= band.min) break;
      add(v);
    }
  }

  // 3. Clamp to the band maximum.
  return chosen.slice(0, band.max);
}

/** Parse the model's tag array from a single-line `tags: [...]` frontmatter field. */
function fmTags(fm: string): string[] {
  const raw = fmScalar(fm, 'tags');
  if (!raw.startsWith('[')) return [];
  return (raw.match(/"([^"]+)"|'([^']+)'/g) ?? []).map((q) => q.slice(1, -1));
}

/** Serialize a tag list to the `tags: ["a", "b"]` frontmatter line. */
function tagsLine(tags: string[]): string {
  return `tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]`;
}

/**
 * Reconcile a draft's `tags:` frontmatter against the pack's controlled
 * vocabulary and SEO band. Surgical — only the `tags:` line is rewritten;
 * everything else round-trips untouched. Returns the content unchanged when
 * there is no frontmatter, or when there are no tags to write (no vocabulary and
 * the model emitted none).
 */
export function reconcileTags(content: string, pack: DraftingPack): string {
  const { fm, body, matched } = splitFrontmatter(content);
  if (!matched) return content;

  const vocab = pack.content.tags ?? [];
  const [min, max] = pack.scoring.seo.tags.good;
  const relevanceText = [fmScalar(fm, 'title'), fmScalar(fm, 'excerpt'), fmScalar(fm, 'category'), body]
    .filter(Boolean)
    .join(' ');

  const tags = selectTags(fmTags(fm), vocab, relevanceText, { min, max });
  if (tags.length === 0) return content;

  const line = tagsLine(tags);
  if (/^tags:.*$/m.test(content)) return content.replace(/^tags:.*$/m, line);
  // No tags line present — append it as the final frontmatter field.
  return content.replace(/^(---\r?\n[\s\S]*?)(\r?\n---)/, `$1\n${line}$2`);
}

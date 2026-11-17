/**
 * Backlink finder — propose internal links INTO a target article from the
 * rest of the live catalog, then apply the accepted ones.
 *
 * Port of Body of Health `src/pages/api/admin/backlinks/[slug].ts`. Lessons
 * kept from BoH:
 *   - Candidates go to the model in chunks (default 8). One call with the whole
 *     catalog truncated its tool JSON and the tail proposals came back
 *     field-less ("Unknown candidate slug undefined").
 *   - Field-less proposals (truncation debris) are dropped and COUNTED, and the
 *     count is surfaced, instead of each one becoming a cryptic rejection.
 *   - The anchor matcher tolerates curly quotes / dashes / NBSP (models
 *     straighten them when copying) but returns the substring exactly as it
 *     appears in the body, so apply works on text that really exists.
 *   - An anchor that occurs more than once is rejected as ambiguous, and
 *     uniqueness is checked again at apply time.
 */

import { defaultBacklinksConfig, effortFor, type BacklinksConfig } from '@jeldon/config';
import { resolveModel } from './provider.js';
import type { DraftingPack, LlmProvider, ToolDef } from './types.js';

export interface BacklinkArticle {
  slug: string;
  /** Full markdown including frontmatter. */
  content: string;
  /** Store sha, passed through so the apply step can save optimistically. */
  sha?: string;
}

export interface BacklinkProposal {
  fromSlug: string;
  fromTitle: string;
  fromSha?: string;
  /** The anchor exactly as it appears in the candidate body. */
  anchorText: string;
  surroundingContext: string;
  rationale: string;
  /** Offset of the anchor in the candidate body (after frontmatter). */
  index: number;
}

export interface BacklinkRejection {
  proposal: { fromSlug: string; anchorText: string; surroundingContext?: string; rationale?: string };
  reason: string;
}

export type BacklinkProposeResult =
  | { status: 'target_not_live'; reason: string; targetSlug: string }
  | {
      status: 'ok';
      targetSlug: string;
      targetTitle: string;
      proposals: BacklinkProposal[];
      rejected: BacklinkRejection[];
      /** Malformed proposals (truncated tool output) dropped across all chunks. */
      droppedMalformed: number;
      /** Candidates whose chunk failed outright and were not scanned. */
      unscanned: number;
      warnings: string[];
      candidatesScanned: number;
      batches: number;
      usage: { input_tokens: number; output_tokens: number };
    };

export interface ProposeBacklinksDeps {
  provider: LlmProvider;
  pack: DraftingPack;
  model?: string;
}

export const PROPOSE_BACKLINKS_TOOL: ToolDef = {
  name: 'propose_backlinks',
  description: 'Return a list of proposed backlink insertions. Empty array if nothing fits.',
  input_schema: {
    type: 'object',
    properties: {
      proposals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            fromSlug: { type: 'string', description: 'Slug of the candidate article that would gain the new link.' },
            anchorText: {
              type: 'string',
              description: 'Exact phrase from the candidate body to wrap in a link. Must match verbatim.',
            },
            surroundingContext: {
              type: 'string',
              description:
                'A 60-200 character window of the candidate body that contains the anchor, so the human reviewer knows where the link will land.',
            },
            rationale: { type: 'string', description: 'One sentence: why this link helps the reader.' },
          },
          required: ['fromSlug', 'anchorText', 'surroundingContext', 'rationale'],
        },
      },
    },
    required: ['proposals'],
  },
};

export function buildBacklinksSystem(pack: DraftingPack, cfg: BacklinksConfig): string {
  return `You are a link editor for ${pack.brand.name}'s website. You're given one TARGET article and a set of CANDIDATE live articles. Find natural places in the candidates where adding a link to the target would help readers — phrases that already mention the target's topic but aren't yet linked anywhere.

Rules:
- The anchor text MUST already appear verbatim in the candidate's body. No rewriting, no paraphrasing — copy the exact phrase, including punctuation/casing as it appears.
- 2-6 words is the sweet spot for anchor text. Avoid generic words ("here", "click here", "the article").
- Skip candidates that already link to the target (anywhere in the body — search for ${cfg.internalPathPrefix}<target-slug>).
- Don't propose more than one backlink per candidate unless they cover genuinely different sections of the target.
- Quality over quantity. 0 proposals is a valid answer if nothing fits naturally.
- Don't propose backlinks inside frontmatter, headings, code blocks, or existing markdown links.
- Each proposal should make the candidate article more useful — not just stuff in keywords.`;
}

// ---------------------------------------------------------------------------
// Anchor matching
// ---------------------------------------------------------------------------

/** 1:1 typographic → ASCII map. One UTF-16 unit each side so offsets line up. */
const CHAR_MAP: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  ' ': ' ',
};

/** Normalise curly quotes, en/em dashes and NBSP. Length-preserving. */
export function normalizeTypography(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    out += CHAR_MAP[ch] ?? ch;
  }
  return out;
}

export interface AnchorMatch {
  /** Offset in `body`, or -1. */
  index: number;
  /** The exact substring of `body` at that offset (may differ from the
   *  requested anchor in quote/dash style). '' when not found. */
  matched: string;
  /** 0, 1, or 2 (= "more than one"). Counted on the normalised text, so a
   *  straight-quote and a curly-quote copy of the same phrase are ambiguous. */
  count: number;
}

/**
 * Find `anchor` in `body`, tolerant of typographic differences. The returned
 * `matched` is always text that really exists in `body`.
 */
export function findAnchor(body: string, anchor: string): AnchorMatch {
  if (!anchor) return { index: -1, matched: '', count: 0 };
  const normBody = normalizeTypography(body);
  const normAnchor = normalizeTypography(anchor);
  const exact = body.indexOf(anchor);
  const idx = exact !== -1 ? exact : normBody.indexOf(normAnchor);
  if (idx === -1) return { index: -1, matched: '', count: 0 };
  const first = normBody.indexOf(normAnchor);
  const count = normBody.indexOf(normAnchor, first + 1) === -1 ? 1 : 2;
  return { index: idx, matched: body.slice(idx, idx + anchor.length), count };
}

// ---------------------------------------------------------------------------
// Frontmatter split (bytes of the frontmatter block are kept verbatim)
// ---------------------------------------------------------------------------

const FM_RE = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

function splitDoc(content: string): { head: string; body: string } {
  const m = content.match(FM_RE);
  if (!m) return { head: '', body: content };
  return { head: m[0], body: content.slice(m[0].length) };
}

function fmField(head: string, key: string): string {
  const m = head.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  return m?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `body` already links to `slug` under `prefix` (not to a longer slug sharing the prefix). */
export function linksTo(body: string, prefix: string, slug: string): boolean {
  return new RegExp(`${escapeRe(prefix)}${escapeRe(slug)}(?![a-z0-9-])`, 'i').test(body);
}

function backlinksConfig(pack: DraftingPack): BacklinksConfig {
  return { ...defaultBacklinksConfig, ...(pack.drafting?.backlinks ?? {}) };
}

// ---------------------------------------------------------------------------
// Propose
// ---------------------------------------------------------------------------

interface Cand {
  slug: string;
  sha?: string;
  body: string;
  title: string;
}

interface RawProposal {
  fromSlug: string;
  anchorText: string;
  surroundingContext?: string;
  rationale?: string;
}

export async function proposeBacklinks(
  input: { target: BacklinkArticle; articles: BacklinkArticle[] },
  deps: ProposeBacklinksDeps,
): Promise<BacklinkProposeResult> {
  const cfg = backlinksConfig(deps.pack);
  const targetSlug = input.target.slug;
  const target = splitDoc(input.target.content);
  if (fmField(target.head, 'draft') === 'true') {
    return {
      status: 'target_not_live',
      targetSlug,
      reason: 'Target article is still a draft. Backlinks should point to live articles — publish it first.',
    };
  }
  const targetTitle = fmField(target.head, 'title') || targetSlug;

  const candidates: Cand[] = input.articles
    .filter((a) => a.slug !== targetSlug)
    .map((a) => {
      const { head, body } = splitDoc(a.content);
      return { a, head, body };
    })
    .filter(({ head, body }) => fmField(head, 'draft') !== 'true' && !linksTo(body, cfg.internalPathPrefix, targetSlug))
    .map(({ a, head, body }) => ({ slug: a.slug, sha: a.sha, body, title: fmField(head, 'title') || a.slug }));

  const empty = {
    status: 'ok' as const,
    targetSlug,
    targetTitle,
    proposals: [],
    rejected: [],
    droppedMalformed: 0,
    unscanned: 0,
    warnings: [],
    candidatesScanned: 0,
    batches: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
  if (!candidates.length) return empty;

  const targetSummary = `<target slug="${targetSlug}">
title: ${targetTitle}
excerpt: ${fmField(target.head, 'excerpt')}
category: ${fmField(target.head, 'category')}

${target.body}
</target>`;

  const size = Math.max(1, cfg.chunkSize);
  const chunks: Cand[][] = [];
  for (let i = 0; i < candidates.length; i += size) chunks.push(candidates.slice(i, i + size));

  const modelId = resolveModel(
    deps.pack.drafting?.models ?? {},
    deps.pack.drafting?.defaultModel ?? 'sonnet',
    deps.model ?? cfg.model,
  );
  const system = buildBacklinksSystem(deps.pack, cfg);
  const warnings: string[] = [];
  let droppedMalformed = 0;
  let unscanned = 0;
  const usage = { input_tokens: 0, output_tokens: 0 };

  const chunkResults = await Promise.all(
    chunks.map(async (chunk, ci): Promise<RawProposal[]> => {
      const label = `Batch ${ci + 1}/${chunks.length}`;
      const block = chunk
        .map((c) => `<candidate slug="${c.slug}" title="${c.title.replace(/"/g, '&quot;')}">\n${c.body}\n</candidate>`)
        .join('\n\n');
      let res;
      try {
        res = await deps.provider.complete({
          model: modelId,
          system,
          maxTokens: cfg.maxTokens,
          tools: [PROPOSE_BACKLINKS_TOOL],
          toolName: PROPOSE_BACKLINKS_TOOL.name,
          effort: effortFor(deps.pack.drafting, 'backlinks'),
          messages: [
            {
              role: 'user',
              content: `${targetSummary}\n\n<candidates>\n${block}\n</candidates>\n\nFind natural backlink opportunities for the target article. Call propose_backlinks with your full list (or an empty array if nothing fits).`,
            },
          ],
        });
      } catch (err) {
        unscanned += chunk.length;
        warnings.push(`${label} failed (${(err as Error).message}) — ${chunk.length} articles not scanned. Re-run to retry.`);
        return [];
      }
      usage.input_tokens += res.usage?.input_tokens ?? 0;
      usage.output_tokens += res.usage?.output_tokens ?? 0;
      if (res.stopReason === 'max_tokens') {
        warnings.push(`${label} output was truncated — some proposals in it were dropped. Re-run to catch the rest.`);
      }
      const tool = res.blocks.find((b) => b.type === 'tool_use' && b.name === PROPOSE_BACKLINKS_TOOL.name);
      const raw: unknown[] =
        tool && tool.type === 'tool_use' && Array.isArray((tool.input as { proposals?: unknown }).proposals)
          ? ((tool.input as { proposals: unknown[] }).proposals)
          : [];
      const wellFormed = raw.filter(
        (p): p is RawProposal =>
          !!p &&
          typeof (p as RawProposal).fromSlug === 'string' &&
          typeof (p as RawProposal).anchorText === 'string',
      );
      const dropped = raw.length - wellFormed.length;
      if (dropped > 0) {
        droppedMalformed += dropped;
        warnings.push(`${label}: ${dropped} malformed proposal(s) dropped (truncated model output).`);
      }
      return wellFormed;
    }),
  );

  const bySlug = new Map(candidates.map((c) => [c.slug, c]));
  const proposals: BacklinkProposal[] = [];
  const rejected: BacklinkRejection[] = [];
  for (const p of chunkResults.flat()) {
    const cand = bySlug.get(p.fromSlug);
    if (!cand) {
      rejected.push({ proposal: p, reason: `Unknown candidate slug "${p.fromSlug}"` });
      continue;
    }
    if (p.anchorText.length < cfg.minAnchorChars) {
      rejected.push({ proposal: p, reason: 'Anchor text missing or too short' });
      continue;
    }
    const found = findAnchor(cand.body, p.anchorText);
    if (found.count === 0) {
      rejected.push({ proposal: p, reason: 'Anchor text not found verbatim in candidate body' });
      continue;
    }
    if (found.count > 1) {
      rejected.push({ proposal: p, reason: 'Anchor text appears multiple times — ambiguous insertion point' });
      continue;
    }
    const anchorText = found.matched;
    const idx = found.index;
    const before = cand.body.slice(Math.max(0, idx - 200), idx);
    const after = cand.body.slice(idx + anchorText.length, idx + anchorText.length + 200);
    if (/\[[^\]]*$/.test(before) && /^[^[]*\]\(/.test(after)) {
      rejected.push({ proposal: p, reason: 'Anchor falls inside an existing markdown link' });
      continue;
    }
    proposals.push({
      fromSlug: cand.slug,
      fromTitle: cand.title,
      fromSha: cand.sha,
      anchorText,
      surroundingContext: p.surroundingContext ?? '',
      rationale: p.rationale ?? '',
      index: idx,
    });
  }

  return {
    ...empty,
    proposals,
    rejected,
    droppedMalformed,
    unscanned,
    warnings,
    candidatesScanned: candidates.length,
    batches: chunks.length,
    usage,
  };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export type ApplyBacklinksResult =
  | { status: 'ok'; content: string }
  | { status: 'conflict'; anchor: string; reason: 'missing' | 'ambiguous'; message: string };

/**
 * Wrap each accepted anchor in a link to the target. Exact match only (the
 * propose step already returned the real substring), and uniqueness is
 * re-checked here: the file may have changed between propose and apply.
 * Frontmatter bytes are kept verbatim.
 */
export function applyBacklinks(
  content: string,
  anchors: string[],
  targetSlug: string,
  opts: { internalPathPrefix?: string; fromSlug?: string } = {},
): ApplyBacklinksResult {
  const prefix = opts.internalPathPrefix ?? defaultBacklinksConfig.internalPathPrefix;
  const where = opts.fromSlug ? ` in ${opts.fromSlug}` : '';
  const { head, body: original } = splitDoc(content);
  let body = original;
  for (const anchor of anchors) {
    const idx = body.indexOf(anchor);
    if (idx === -1) {
      return {
        status: 'conflict',
        anchor,
        reason: 'missing',
        message: `Anchor "${anchor}" no longer${where} (file may have changed since proposals were generated)`,
      };
    }
    if (body.indexOf(anchor, idx + 1) !== -1) {
      return {
        status: 'conflict',
        anchor,
        reason: 'ambiguous',
        message: `Anchor "${anchor}" now appears multiple times${where} — re-run the finder`,
      };
    }
    body = `${body.slice(0, idx)}[${anchor}](${prefix}${targetSlug})${body.slice(idx + anchor.length)}`;
  }
  return { status: 'ok', content: `${head}${body}` };
}

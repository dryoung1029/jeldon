/**
 * draft(ctx, deps) — the score → verify → one-shot-fix-pass draft loop, emitting
 * NDJSON events. Faithful port of BoH `src/pages/api/admin/author.ts::handlePost`
 * + its streaming envelope. The Astro/Cloudflare request handling and the
 * heartbeat-stream wrapper are dropped (host concern); the orchestration —
 * mode→prompt/tool selection, the Anthropic call, forcePublishDate,
 * series/outline validation, the per-draft and per-sibling fix-pass, and the
 * inline reply summary — is lifted verbatim against injected dependencies.
 *
 * Yields `DraftEvent`s (`progress` / `result` / `error`). The host serializes
 * one per line and streams them — the same wire protocol BoH chat.ts used,
 * unified with author.ts's trailing-JSON payload.
 */

import type { ClaimVerifier, VerificationReport } from '@jeldon/verify';
import { forcePublishDate } from './frontmatter.js';
import type { PromptPack } from './prompts.js';
import { resolveModel } from './provider.js';
import { reconcileTags } from './tags.js';
import { collectIssues, formatReport, scoreAndVerify } from './score-verify.js';
import { TOOLS_SERIES_DRAFT, TOOLS_SINGLE, toolsOutline } from './tools.js';
import type {
  DraftContext,
  DraftEvent,
  DraftFrontmatterCodec,
  DraftMode,
  DraftResult,
  DraftingPack,
  LlmProvider,
  OutlineResult,
  ScorePair,
  SeriesResult,
  ToolDef,
} from './types.js';

export interface DraftDeps {
  provider: LlmProvider;
  pack: DraftingPack;
  prompts: PromptPack;
  /** Already-built knowledge block (call getSiteKnowledge at the host). */
  knowledge: string;
  verifier: ClaimVerifier;
  codec: DraftFrontmatterCodec;
  /** Today's ISO date (`YYYY-MM-DD`). Injected so the host owns the clock. */
  today: string;
}

interface ModeConfig {
  baseSystem: string;
  tools?: ToolDef[];
  toolChoice?: { type: 'tool'; name: string };
  maxTokens: number;
}

function modeConfig(mode: DraftMode, prompts: PromptPack, pack: DraftingPack): ModeConfig {
  const mt = pack.drafting?.maxTokens;
  switch (mode) {
    case 'draft':
      return {
        baseSystem: prompts.draftSingle,
        tools: TOOLS_SINGLE,
        toolChoice: { type: 'tool', name: 'create_draft' },
        maxTokens: mt?.draft ?? 16000,
      };
    case 'outline':
      return {
        baseSystem: prompts.outline,
        tools: toolsOutline(pack),
        toolChoice: { type: 'tool', name: 'propose_series' },
        maxTokens: mt?.outline ?? 4000,
      };
    case 'draft-series':
      return {
        baseSystem: prompts.draftSeries,
        tools: TOOLS_SERIES_DRAFT,
        toolChoice: { type: 'tool', name: 'create_series' },
        maxTokens: mt?.['draft-series'] ?? 64000,
      };
    case 'draft-series-article':
      // One article from a series outline — reuses the single-draft tool so the
      // client gets the same shape as a plain 'draft' call, looped externally.
      return {
        baseSystem: prompts.draftSeriesArticle,
        tools: TOOLS_SINGLE,
        toolChoice: { type: 'tool', name: 'create_draft' },
        maxTokens: mt?.['draft-series-article'] ?? 12000,
      };
    default:
      return { baseSystem: prompts.brainstorm, maxTokens: mt?.brainstorm ?? 1500 };
  }
}

/** Run one bounded fix-pass against a draft's issues. Returns the corrected
 *  markdown, or null if the model didn't return one. BoH `runFixPass`. */
async function runFixPass(
  deps: DraftDeps,
  modelId: string,
  original: string,
  issues: string[],
): Promise<string | null> {
  const system = `${deps.prompts.fixPassSystem({ today: deps.today, issues })}\n\n---\n\n${deps.knowledge}`;
  try {
    const res = await deps.provider.complete({
      model: modelId,
      maxTokens: deps.pack.drafting?.maxTokens.fixPass ?? 16000,
      system,
      tools: TOOLS_SINGLE,
      toolChoice: { type: 'tool', name: 'create_draft' },
      messages: [
        {
          role: 'user',
          content: `Here is the draft to revise. Return the corrected full markdown via create_draft.\n\n${original}`,
        },
      ],
    });
    for (const block of res.blocks) {
      if (block.type === 'tool_use' && block.name === 'create_draft') {
        const content = (block.input as { content?: unknown }).content;
        if (typeof content === 'string') return content;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The drafting orchestrator. Async-generator so the host can pump events to an
 * NDJSON stream. On a fatal error it yields a single `{ type: 'error' }`.
 */
export async function* draft(ctx: DraftContext, deps: DraftDeps): AsyncGenerator<DraftEvent> {
  const { provider, pack, prompts, knowledge, verifier, codec, today } = deps;
  try {
    const models = pack.drafting?.models ?? {};
    const defaultAlias = pack.drafting?.defaultModel ?? 'sonnet';
    const modelId = resolveModel(models, defaultAlias, ctx.model);

    const cfg = modeConfig(ctx.mode, prompts, pack);

    yield { type: 'progress', pct: 5, label: 'Composing the request…' };

    const dateHint = `\n\nTODAY'S DATE IS: ${today} — use this exact ISO date for any publishDate frontmatter field.`;
    const system = `${cfg.baseSystem}${dateHint}\n\n---\n\n${knowledge}`;

    yield { type: 'progress', pct: 12, label: 'Generating…' };

    const res = await provider.complete({
      model: modelId,
      maxTokens: cfg.maxTokens,
      system,
      messages: ctx.messages,
      tools: cfg.tools,
      toolChoice: cfg.toolChoice,
    });

    let reply = '';
    let draftOut: DraftResult | undefined;
    let outline: OutlineResult | undefined;
    let series: SeriesResult | undefined;
    for (const block of res.blocks) {
      if (block.type === 'text') reply += block.text;
      else if (block.type === 'tool_use') {
        if (block.name === 'create_draft') draftOut = block.input as unknown as DraftResult;
        else if (block.name === 'propose_series') outline = block.input as unknown as OutlineResult;
        else if (block.name === 'create_series') series = block.input as unknown as SeriesResult;
      }
    }

    // Force publishDate to today on every generated draft (knowledge cutoff
    // means "today" hallucinates without help; the prompt hint isn't 100%).
    if (draftOut?.content) draftOut.content = forcePublishDate(draftOut.content, today);
    if (series?.articles) {
      for (const a of series.articles) {
        if (a?.content) a.content = forcePublishDate(a.content, today);
      }
    }

    // Reconcile tags against the controlled vocabulary + SEO band BEFORE scoring,
    // so the reported score reflects the tags the article ships with. Surgical:
    // only the `tags:` frontmatter line is touched.
    if (draftOut?.content) draftOut.content = reconcileTags(draftOut.content, pack);
    if (series?.articles) {
      for (const a of series.articles) {
        if (a?.content) a.content = reconcileTags(a.content, pack);
      }
    }

    // Validate tool inputs — a max_tokens-truncated tool call comes back with
    // articles as null/string/partial. Surface a clean error, not a crash.
    if (series) {
      if (!Array.isArray(series.articles) || series.articles.length === 0) {
        yield {
          type: 'error',
          error:
            res.stopReason === 'max_tokens'
              ? `Model ran out of output tokens before finishing the series (used ${res.usage.output_tokens}). Try fewer articles or shorter length.`
              : `Model returned a malformed series payload (stop_reason: ${res.stopReason}). Try again or draft articles individually.`,
        };
        return;
      }
      const bad = series.articles.findIndex(
        (a) => !a || typeof a.slug !== 'string' || typeof a.content !== 'string',
      );
      if (bad !== -1) {
        yield {
          type: 'error',
          error: `Article ${bad + 1} of the series is incomplete (stop_reason: ${res.stopReason}, output_tokens: ${res.usage.output_tokens}). The model likely ran out of room.`,
        };
        return;
      }
    }
    if (outline && !Array.isArray(outline.articles)) {
      yield { type: 'error', error: `Model returned a malformed outline (stop_reason: ${res.stopReason}).` };
      return;
    }

    // Score + verify + optional one-shot fix-pass (single draft).
    let scoreReport: ScorePair | null = null;
    let scoreSeries: Array<(ScorePair & { slug: string }) | null> | null = null;
    let cite8Report: VerificationReport | null = null;
    let cite8Series: Array<VerificationReport | null> | null = null;
    let fixPassFired = false;
    let fixPassesSeries: number[] = [];

    if (draftOut?.content) {
      yield { type: 'progress', pct: 60, label: 'Scoring + verifying the draft…' };
      const initial = await scoreAndVerify({
        provider, pack, verifier, codec,
        extractSystem: prompts.extractClaimsSystem,
        draft: draftOut,
      });
      const issues = collectIssues(pack, initial.scores, initial.report);
      if (issues.length) {
        yield { type: 'progress', pct: 75, label: 'Applying a fix-pass…', detail: `${issues.length} issue(s)` };
        const fixed = await runFixPass(deps, modelId, draftOut.content, issues);
        if (fixed) {
          draftOut.content = forcePublishDate(fixed, today);
          fixPassFired = true;
          const post = await scoreAndVerify({
            provider, pack, verifier, codec,
            extractSystem: prompts.extractClaimsSystem,
            draft: draftOut,
          });
          scoreReport = post.scores;
          cite8Report = post.report;
        } else {
          scoreReport = initial.scores;
          cite8Report = initial.report;
        }
      } else {
        scoreReport = initial.scores;
        cite8Report = initial.report;
      }
    }

    // Same pipeline per sibling in a full-series draft.
    if (series?.articles) {
      yield { type: 'progress', pct: 60, label: 'Scoring + verifying each sibling…' };
      cite8Series = [];
      scoreSeries = [];
      fixPassesSeries = [];
      for (let i = 0; i < series.articles.length; i++) {
        const a = series.articles[i];
        if (!a?.content) {
          cite8Series.push(null);
          scoreSeries.push(null);
          continue;
        }
        const initial = await scoreAndVerify({
          provider, pack, verifier, codec,
          extractSystem: prompts.extractClaimsSystem,
          draft: a,
        });
        const issues = collectIssues(pack, initial.scores, initial.report);
        if (issues.length) {
          const fixed = await runFixPass(deps, modelId, a.content, issues);
          if (fixed) {
            a.content = forcePublishDate(fixed, today);
            fixPassesSeries.push(i);
            const post = await scoreAndVerify({
              provider, pack, verifier, codec,
              extractSystem: prompts.extractClaimsSystem,
              draft: a,
            });
            scoreSeries.push({ ...post.scores, slug: a.slug });
            cite8Series.push(post.report);
            continue;
          }
        }
        scoreSeries.push({ ...initial.scores, slug: a.slug });
        cite8Series.push(initial.report);
      }
    }

    yield { type: 'progress', pct: 92, label: 'Finalizing…' };

    // Inline reply summary the editor sees in chat. BoH author.ts tail.
    const floorSeo = pack.drafting?.draftFloor.seo ?? pack.scoring.geo.floor;
    const floorGeo = pack.drafting?.draftFloor.geo ?? pack.scoring.geo.floor;
    let replyOut = reply.trim();
    if (scoreReport) {
      const fixNote = fixPassFired ? ' · auto-fix pass applied' : '';
      const tag = scoreReport.seo >= floorSeo && scoreReport.geo >= floorGeo ? '✅' : '⚠️';
      replyOut += `\n\n---\n${tag} **Draft scored: SEO ${scoreReport.seo} · GEO ${scoreReport.geo}**${fixNote}`;
      if (cite8Report && cite8Report.status !== 'disabled') {
        replyOut += formatReport(cite8Report);
      }
    }
    if (cite8Series && cite8Series.some((r) => r && r.status !== 'disabled')) {
      const lines = cite8Series
        .map((r, i) => {
          if (!r || r.status === 'disabled') return null;
          const slug = series?.articles[i]?.slug || `article-${i + 1}`;
          const s = scoreSeries?.[i];
          const scoreStr = s ? ` (SEO ${s.seo} · GEO ${s.geo})` : '';
          const fix = fixPassesSeries.includes(i) ? ' · auto-fix applied' : '';
          return `**${slug}**${scoreStr}${fix}: ${formatReport(r).replace(/^\n\n---\n/, '')}`;
        })
        .filter((l): l is string => Boolean(l));
      if (lines.length) replyOut += `\n\n---\n### verification + scoring (per sibling)\n${lines.join('\n\n')}`;
    }

    yield { type: 'progress', pct: 100, label: 'Done' };
    yield {
      type: 'result',
      reply: replyOut,
      draft: draftOut,
      outline,
      series,
      scores: scoreReport,
      scoresSeries: scoreSeries,
      fixPassFired,
      fixPassesSeries,
      model: res.model,
      stopReason: res.stopReason,
      usage: res.usage,
    };
  } catch (err) {
    yield { type: 'error', error: (err as Error).message };
  }
}

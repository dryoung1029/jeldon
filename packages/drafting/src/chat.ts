/**
 * chatEdit(ctx, deps) — the agentic, citation-verifying editor chat, emitting
 * NDJSON events. Faithful port of BoH `src/pages/api/admin/chat.ts`.
 *
 * The model may call `verify_citation` (executed here, server-side, against the
 * injected `ClaimVerifier`) any number of times before its final reply/edit.
 * verify_citation is read-only and fed back into the conversation;
 * update_article / update_articles stay terminal (the UI turns those into a
 * review-and-commit proposal). The round cap keeps a confused model from
 * looping; each round can batch many claims.
 *
 * Couplings broken vs BoH: Anthropic streaming → `LlmProvider.stream`; cite8
 * `verifyClaim` → the `ClaimVerifier`; the hardwired frontmatter merge →
 * injected codec; the inline SYSTEM/TOOLS → the PromptPack + tools module.
 */

import type { ClaimVerifier, VerificationReport } from '@jeldon/verify';
import { mergePreservingFrontmatter } from './frontmatter.js';
import type { PromptPack } from './prompts.js';
import { resolveModel } from './provider.js';
import { chatTools } from './tools.js';
import type {
  ChatContext,
  ChatEvent,
  DraftingPack,
  LlmMessage,
  LlmProvider,
  StreamBlock,
} from './types.js';

export interface ChatDeps {
  provider: LlmProvider;
  pack: DraftingPack;
  prompts: PromptPack;
  knowledge: string;
  verifier: ClaimVerifier;
  /** Full frontmatter codec for the merge-preserving step (inject
   *  @jeldon/store's defaultFrontmatterCodec). When omitted, model output is
   *  used as-is (no merge). */
  codec?: {
    parse(raw: string): { frontmatter: Record<string, unknown>; body: string };
    serialize(doc: { frontmatter: Record<string, unknown>; body: string }): string;
  };
  /** Cap on verify_citation rounds. BoH: 6. */
  maxVerifyRounds?: number;
}

/** The agentic chat loop. Async-generator yielding `ChatEvent`s. */
export async function* chatEdit(ctx: ChatContext, deps: ChatDeps): AsyncGenerator<ChatEvent> {
  const { provider, pack, prompts, knowledge, verifier, codec } = deps;
  try {
    const models = pack.drafting?.models ?? {};
    const defaultAlias = pack.drafting?.defaultModel ?? 'sonnet';
    const modelId = resolveModel(models, defaultAlias, ctx.model);
    const system = `${prompts.chatSystem}\n\n---\n\n${knowledge}`;
    const verifierConfigured = verifier.kind !== 'none';

    const siblingBlock =
      Array.isArray(ctx.siblings) && ctx.siblings.length > 0
        ? '\n\n<siblings>\n' +
          ctx.siblings.map((s) => `<sibling slug="${s.slug}">\n${s.content}\n</sibling>`).join('\n\n') +
          '\n</siblings>'
        : '';

    const seoBlock =
      ctx.seo && Array.isArray(ctx.seo.checks) && ctx.seo.checks.length > 0
        ? `\n\n<seo_status score="${ctx.seo.score}/100">\n` +
          ctx.seo.checks.map((c) => `- [${c.status.toUpperCase()}] ${c.label}: ${c.value}`).join('\n') +
          '\n</seo_status>'
        : '';

    // Splice the article/siblings/SEO context into the LAST user message.
    const messages: LlmMessage[] = ctx.messages.map((m, i) => {
      if (i === ctx.messages.length - 1 && m.role === 'user' && typeof m.content === 'string') {
        return {
          role: 'user',
          content: `<current_article>\n${ctx.articleContent}\n</current_article>${siblingBlock}${seoBlock}\n\n${m.content}`,
        };
      }
      return m;
    });

    const convo: LlmMessage[] = [...messages];
    const maxTokens = pack.drafting?.maxTokens.chat ?? 32000;
    const tools = chatTools(verifierConfigured);
    const MAX_VERIFY_ROUNDS = deps.maxVerifyRounds ?? 6;

    let ordered: StreamBlock[] = [];
    let stopReason: string | null = null;
    let modelOut = modelId;
    const usage = { input_tokens: 0, output_tokens: 0 };
    let verifyRounds = 0;
    let pct = 6;

    yield { type: 'progress', pct, label: 'Reading the article and your request…' };

    while (true) {
      const turn = await provider.stream({ model: modelId, system, messages: convo, maxTokens, tools });
      ordered = turn.ordered;
      stopReason = turn.stopReason;
      modelOut = turn.modelOut;
      usage.input_tokens += turn.usage.input_tokens || 0;
      usage.output_tokens += turn.usage.output_tokens || 0;

      const toolUses = ordered.filter((b) => b.type === 'tool_use');
      const verifyCalls = toolUses.filter((b) => b.name === 'verify_citation');

      if (verifyCalls.length && verifyRounds < MAX_VERIFY_ROUNDS) {
        verifyRounds++;
        pct = Math.min(70, pct + 12);
        yield {
          type: 'progress',
          pct: Math.round(pct),
          label: `Verifying ${verifyCalls.length} citation${verifyCalls.length > 1 ? 's' : ''}…`,
        };

        // Echo the model's assistant turn back verbatim (text + every tool_use).
        const assistantContent: unknown[] = [];
        for (const b of ordered) {
          if (b.type === 'text') {
            if (b.text) assistantContent.push({ type: 'text', text: b.text });
          } else {
            let input: unknown = {};
            try {
              input = b.jsonAcc ? JSON.parse(b.jsonAcc) : {};
            } catch {
              /* leave {} */
            }
            assistantContent.push({ type: 'tool_use', id: b.id, name: b.name, input });
          }
        }
        convo.push({ role: 'assistant', content: assistantContent });

        // Every tool_use needs a matching tool_result. Run cite8 lookups; for
        // an update tool issued prematurely in the same turn, return a nudge.
        const toolResults: unknown[] = [];
        const stepInc = verifyCalls.length ? 10 / verifyCalls.length : 0;
        for (const tu of toolUses) {
          let input: { claim?: unknown } = {};
          try {
            input = tu.jsonAcc ? JSON.parse(tu.jsonAcc) : {};
          } catch {
            /* leave {} */
          }
          if (tu.name === 'verify_citation') {
            const claim = String(input.claim ?? '');
            const r = await runVerifyCitation(verifier, claim);
            pct = Math.min(80, pct + stepInc);
            yield {
              type: 'progress',
              pct: Math.round(pct),
              label: 'Verifying citations…',
              detail: `${verdictIcon(r.verdict)} ${shorten(claim)}${r.pmid ? ` → ${r.pmid}` : r.verdict ? ` — ${r.verdict}` : ''}`,
            };
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: r.content });
          } else {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content:
                'Not executed. Finish verifying every citation with verify_citation first, then re-issue this edit as your final action.',
            });
          }
        }
        convo.push({ role: 'user', content: toolResults });
        pct = Math.min(85, pct + 3);
        yield { type: 'progress', pct: Math.round(pct), label: 'Writing the edit…' };
        continue;
      }
      break;
    }

    yield { type: 'progress', pct: 95, label: 'Finalizing…' };

    let reply = '';
    let newContent: string | undefined;
    let summary: string | undefined;
    let updates: Array<{ slug: string; newContent: string }> | undefined;
    for (const block of ordered) {
      if (block.type === 'text') {
        reply += block.text;
      } else if (block.type === 'tool_use') {
        if (block.name === 'verify_citation') continue; // read-only; handled in the loop
        let parsed: { newContent?: string; summary?: string; updates?: unknown } = {};
        try {
          parsed = JSON.parse(block.jsonAcc);
        } catch {
          yield {
            type: 'error',
            error:
              stopReason === 'max_tokens'
                ? `Model ran out of output tokens before finishing the ${block.name} call (used ${usage.output_tokens}). Try a smaller change or two passes.`
                : `Failed to parse streamed ${block.name} input (stop_reason=${stopReason ?? 'unknown'}; accumulated ${block.jsonAcc.length} chars).`,
          };
          return;
        }
        if (block.name === 'update_article') {
          newContent = mergePreservingFrontmatter(ctx.articleContent, parsed.newContent ?? '', codec);
          summary = parsed.summary ?? summary;
        } else if (block.name === 'update_articles') {
          if (Array.isArray(parsed.updates)) {
            const siblingsBySlug = new Map<string, string>(
              (ctx.siblings ?? []).map((s) => [s.slug, s.content]),
            );
            updates = (parsed.updates as Array<{ slug?: unknown; newContent?: unknown }>)
              .filter(
                (u): u is { slug: string; newContent: string } =>
                  !!u && typeof u.slug === 'string' && typeof u.newContent === 'string',
              )
              .map((u) => ({
                slug: u.slug,
                newContent: mergePreservingFrontmatter(
                  siblingsBySlug.get(u.slug) ?? ctx.articleContent,
                  u.newContent,
                  codec,
                ),
              }));
          }
          summary = parsed.summary ?? summary;
        }
      }
    }

    if (updates !== undefined && (!Array.isArray(updates) || updates.length === 0)) {
      yield {
        type: 'error',
        error:
          stopReason === 'max_tokens'
            ? `Model ran out of output tokens before finishing the multi-file edit (used ${usage.output_tokens}). Try a smaller change or two passes.`
            : `Model returned a malformed multi-file edit (stop_reason: ${stopReason}).`,
      };
      return;
    }

    yield { type: 'progress', pct: 100, label: 'Done' };
    yield {
      type: 'result',
      reply: reply.trim() || (summary ?? ''),
      newContent,
      updates,
      summary,
      model: modelOut,
      usage,
    };
  } catch (err) {
    yield { type: 'error', error: (err as Error).message };
  }
}

/**
 * Execute one verify lookup and shape it for the model. Returns the tool_result
 * content (compact JSON the model reads) plus the top source's verdict + id for
 * the live progress line. BoH `chat.ts::runVerifyCitation`, adapted to the
 * @jeldon/verify `ClaimVerifier` (which returns a one-claim VerificationReport).
 */
async function runVerifyCitation(
  verifier: ClaimVerifier,
  claim: string,
): Promise<{ content: string; verdict?: string; pmid?: string }> {
  const c = claim.trim();
  if (!c) {
    return { content: JSON.stringify({ error: 'Empty claim — pass a specific factual claim to verify.' }) };
  }
  let report: VerificationReport;
  try {
    report = await verifier.verifyClaims([c], { k: 4, includeQuotes: true });
  } catch (err) {
    return {
      content: `The verifier could not be reached (${(err as Error).message}). Treat this claim as unverifiable — use a falsifiable search URL, do NOT invent an identifier, and tell the user.`,
      verdict: 'error',
    };
  }
  if (report.status === 'disabled') {
    return {
      content:
        'The verifier is NOT configured, so this claim could not be verified. Do NOT claim it was verified and do NOT invent an identifier. Use a falsifiable search URL and tell the user it is unverified.',
      verdict: 'unavailable',
    };
  }
  if (report.status === 'error') {
    return {
      content: `The verifier could not be reached (${report.reason}). Treat this claim as unverifiable — use a falsifiable search URL, do NOT invent an identifier, and tell the user.`,
      verdict: 'error',
    };
  }
  const result = report.claims[0];
  const sources = (result?.sources ?? []).slice(0, 4).map((s) => ({
    pmid: s.pmid,
    doi: s.doi,
    title: s.title,
    url: s.url,
    quote: s.quote,
  }));
  const top = sources[0];
  const content = JSON.stringify({
    claim: result?.claim ?? c,
    verdict: result?.verdict,
    notes: result?.notes,
    sources,
    guidance:
      'Cite ONLY these returned identifiers/URLs. Prefer a source on a "supports" or "partial" claim; if you quote, quote its "quote" verbatim with attribution. If the claim is unverified/contradicts, use a falsifiable search URL or pull the claim — never use an identifier not listed here.',
  });
  return { content, verdict: result?.verdict, pmid: top?.pmid };
}

function shorten(s: string, n = 64): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function verdictIcon(verdict?: string): string {
  switch (verdict) {
    case 'supports':
      return '✓';
    case 'partial':
      return '≈';
    case 'contradicts':
      return '✗';
    case 'unrelated':
    case 'unverified':
    case 'unknown':
      return '·';
    case 'unavailable':
    case 'error':
      return '⚠';
    default:
      return '•';
  }
}

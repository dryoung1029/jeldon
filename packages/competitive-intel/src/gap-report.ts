import type { DraftingConfig } from '@jeldon/config';
import { defaultDraftingConfig } from '@jeldon/config';
import { buildGapReportSystem, type PromptBrand } from './prompts.js';
import type { CompetitorAudit, GapReport } from './types.js';

/**
 * Claude-powered gap-report generator. Compares our audit + a competitor's audit
 * + our content inventory and produces a structured strategic memo. Uses
 * Anthropic's STREAMING API to avoid the Cloudflare 524 edge timeout on long
 * tool completions (Anthropic is fronted by Cloudflare).
 *
 * Ported from Body of Health `competitor-gap-report.ts`. The SYSTEM prompt's
 * identity + voice come from the Domain Pack (`buildGapReportSystem`); the
 * content-category enum in the tool schema is read from `pack.content.categories`
 * (was the hardcoded evidence/practice/education/investigation enum). The SSE
 * parser + the `slim()` payload reducer are domain-general and stay verbatim.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function buildTool(categories: string[]) {
  return {
    name: 'gap_report',
    description: 'Produce a structured competitive strategy memo.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One paragraph TL;DR (<=4 sentences).' },
        quickWins: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', description: 'Action sentence, <=30 words.' },
              rationale: { type: 'string', description: 'Why this beats them, <=30 words.' },
              effort: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
            required: ['action', 'rationale', 'effort'],
          },
        },
        contentGaps: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            properties: {
              suggestedTitle: { type: 'string' },
              targetQuery: { type: 'string' },
              keyPoints: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
              category: { type: 'string', enum: categories },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              rationale: { type: 'string', description: '<=30 words.' },
            },
            required: ['suggestedTitle', 'targetQuery', 'keyPoints', 'category', 'priority', 'rationale'],
          },
        },
        gbpGaps: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', description: '<=25 words.' },
              rationale: { type: 'string', description: '<=25 words.' },
            },
            required: ['action', 'rationale'],
          },
        },
        ourAdvantages: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              advantage: { type: 'string', description: '<=25 words.' },
              howToLeanIn: { type: 'string', description: '<=25 words.' },
            },
            required: ['advantage', 'howToLeanIn'],
          },
        },
      },
      required: ['summary', 'quickWins', 'contentGaps', 'gbpGaps', 'ourAdvantages'],
    },
  };
}

/** Aggressive slim — only the signal the model needs. ~30KB audit -> ~3KB. */
function slim(a: CompetitorAudit | null) {
  if (!a) return null;
  return {
    url: a.homepage?.finalUrl,
    homepage: a.homepage
      ? {
          title: a.homepage.title,
          metaDescription: a.homepage.metaDescription,
          h1: a.homepage.h1,
          h2Count: a.homepage.h2Count,
          wordCount: a.homepage.wordCount,
          imageCount: a.homepage.imageCount,
          imagesWithAlt: a.homepage.imagesWithAlt,
          internalLinks: a.homepage.internalLinks,
          ogTagsPresent: a.homepage.ogTags
            ? Object.entries(a.homepage.ogTags)
                .filter(([, v]) => v)
                .map(([k]) => k)
            : [],
          hasFaqHint: a.homepage.hasFaqHint,
          hasBlogHint: a.homepage.hasBlogHint,
          hasTeamHint: a.homepage.hasTeamHint,
          geoScore: a.homepage.geoScore,
          geoBadCount: a.homepage.geoBadCount,
          geoMehCount: a.homepage.geoMehCount,
        }
      : null,
    schemaTypes: a.schemaOrg?.types ?? [],
    schemaFieldsByType: a.schemaOrg?.fieldsByType ?? {},
    sitemapUrlCount: a.sitemap?.urlCount ?? null,
    pageStats: a.pageStats ?? null,
    templateVendor: a.templateVendor ?? null,
    pageSpeed: a.pageSpeed
      ? {
          mobile: a.pageSpeed.mobile,
          desktop_perf: a.pageSpeed.desktop?.performance,
          lcp_lab: a.pageSpeed.lcp,
          cls_lab: a.pageSpeed.cls,
        }
      : null,
    gbp: a.gbp
      ? {
          rating: a.gbp.rating,
          reviewCount: a.gbp.reviewCount,
          photosSampled: a.gbp.photoCount,
          hoursComplete: a.gbp.hoursComplete,
          category: a.gbp.category,
        }
      : null,
    positioning: a.positioning
      ? {
          summary: a.positioning.summary,
          topKeywords: a.positioning.keywords
            .slice(0, 15)
            .map((k) => ({ phrase: k.phrase, weight: k.weight, intent: k.intent })),
          marketingSegments: a.positioning.marketingSegments,
          differentiators: a.positioning.differentiators,
          contentThemes: a.positioning.contentThemes,
        }
      : null,
  };
}

export interface GapReportOptions {
  apiKey: string;
  competitorName: string;
  competitorAudit: CompetitorAudit;
  ourAudit: CompetitorAudit | null;
  articleInventory: Array<{ slug: string; title: string; category: string; excerpt: string }>;
  targetKeywords: string[];
  /** Domain Pack slice for the SYSTEM prompt + the content-category enum. */
  pack: PromptBrand;
  /** Model alias. Defaults to `drafting.defaultModel`. */
  model?: string;
  /** Drafting config for the model map. Defaults to `defaultDraftingConfig`. */
  drafting?: DraftingConfig;
  /** Internal-link path prefix for inventory rendering (e.g. "articles"). Default "articles". */
  inventoryPathPrefix?: string;
}

export async function gapReport(opts: GapReportOptions): Promise<GapReport> {
  const drafting = opts.drafting ?? defaultDraftingConfig;
  const alias = opts.model ?? drafting.defaultModel;
  const modelId = drafting.models[alias] ?? drafting.models[drafting.defaultModel] ?? alias;
  const pathPrefix = opts.inventoryPathPrefix ?? 'articles';

  const inventoryBlock = opts.articleInventory.length
    ? opts.articleInventory
        .map((a) => `- [${a.category}] /${pathPrefix}/${a.slug} — "${a.title}"`)
        .join('\n')
    : '(no content yet)';

  const focusBlock =
    '\n\nFor every quickWin, cite the SPECIFIC audit value (ours and theirs) in the rationale so the recommendation can be sanity-checked. Apply the METRIC PARITY hard rule: if ours already meets or exceeds theirs on that value, it is an ourAdvantages item or omitted — NEVER a quickWin. Re-read each quickWin before returning and delete any that (a) say "increase/expand/add more" on a metric we already lead, or (b) ask to audit, verify, monitor, or guard against regression on a metric where our audit value already meets or beats theirs.';

  const userMessage = `COMPETITOR: ${opts.competitorName}

COMPETITOR AUDIT:
${JSON.stringify(slim(opts.competitorAudit), null, 2)}

OUR SITE:
${opts.ourAudit ? JSON.stringify(slim(opts.ourAudit), null, 2) : '(no self-audit — assume strong schema, FAQ, fast pages, and the content inventory below)'}${focusBlock}

CONTENT INVENTORY (${opts.articleInventory.length}; do not propose duplicates):
${inventoryBlock}

TARGET KEYWORDS:
${opts.targetKeywords.length ? opts.targetKeywords.map((k) => `- ${k}`).join('\n') : '(none specified)'}

Produce the gap report by calling gap_report.`;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 8000,
      stream: true,
      system: buildGapReportSystem(opts.pack),
      tools: [buildTool(opts.pack.content.categories)],
      tool_choice: { type: 'tool', name: 'gap_report' },
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  if (!res.body) throw new Error('Anthropic returned no body');

  // Parse the SSE stream. The tool_use input arrives as input_json_delta chunks.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let toolJsonAccumulator = '';
  let stopReason: string | null = null;

  const processEvent = (ev: string) => {
    const dataLines = ev
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''));
    if (!dataLines.length) return;
    const payload = dataLines.join('\n').trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const json = JSON.parse(payload);
      if (json.type === 'content_block_delta' && json.delta?.type === 'input_json_delta') {
        toolJsonAccumulator += json.delta.partial_json ?? '';
      } else if (json.type === 'message_delta' && json.delta?.stop_reason) {
        stopReason = json.delta.stop_reason;
      }
    } catch {
      /* skip malformed event */
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    const events = buf.split('\n\n');
    buf = events.pop() ?? '';
    for (const ev of events) processEvent(ev);
  }
  buf += decoder.decode().replace(/\r\n/g, '\n');
  if (buf.trim()) for (const ev of buf.split('\n\n')) processEvent(ev);

  if (!toolJsonAccumulator) {
    throw new Error(`Model returned no tool input (stop_reason: ${stopReason ?? 'unknown'})`);
  }
  if (stopReason === 'max_tokens') {
    throw new Error(
      'Gap report truncated — model hit max_tokens (8000) before finishing. Try regenerating.',
    );
  }

  let parsed: Omit<GapReport, 'generatedAt' | 'model'>;
  try {
    parsed = JSON.parse(toolJsonAccumulator);
  } catch (e) {
    const head = toolJsonAccumulator.slice(0, 200);
    const tail = toolJsonAccumulator.slice(-200);
    throw new Error(
      `Failed to parse streamed tool input (${(e as Error).message}; stop_reason=${stopReason ?? 'unknown'}; accumulated ${toolJsonAccumulator.length} chars). Head: ${head} … Tail: ${tail}`,
    );
  }

  return { ...parsed, generatedAt: new Date().toISOString(), model: modelId };
}

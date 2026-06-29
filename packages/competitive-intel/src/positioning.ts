import type { DraftingConfig } from '@jeldon/config';
import { defaultDraftingConfig } from '@jeldon/config';
import { buildPositioningSystem, type PromptBrand } from './prompts.js';
import type { Positioning, SampledPage } from './types.js';

/**
 * Positioning extractor — given a competitor's homepage text + sampled pages,
 * asks Claude to surface the keywords they optimize for, the segments they
 * target, their differentiators, and their content themes. Output feeds the gap
 * report and the priority-keyword aggregator.
 *
 * Ported from Body of Health `competitor-positioning.ts`. The SYSTEM prompt's
 * clinic identity is now built from the Domain Pack (`buildPositioningSystem`);
 * the model alias map comes from `pack.drafting` (or `defaultDraftingConfig`).
 * The keyword-intent taxonomy is domain-general and stays verbatim.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const INTENTS = ['commercial', 'informational', 'navigational', 'local'] as const;

const TOOL = {
  name: 'extract_positioning',
  description: "Extract the competitor's positioning, target segments, and keyword strategy from their site content.",
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: '2-3 sentence positioning summary: who they are, who they target, what they lean on.' },
      keywords: {
        type: 'array',
        minItems: 5,
        maxItems: 30,
        items: {
          type: 'object',
          properties: {
            phrase: { type: 'string', description: 'The actual keyword/phrase, lowercased, as a searcher would type it.' },
            weight: { type: 'number', description: '1-10, based on prominence across the site.' },
            intent: { type: 'string', enum: [...INTENTS] },
          },
          required: ['phrase', 'weight', 'intent'],
        },
      },
      marketingSegments: {
        type: 'array',
        items: { type: 'string' },
        description: 'Customer/patient archetypes they explicitly court.',
      },
      differentiators: {
        type: 'array',
        items: { type: 'string' },
        description: 'What they brag about. E.g. "30+ years experience", "same-day appointments".',
      },
      contentThemes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Topic clusters covered by their blog/education pages.',
      },
    },
    required: ['summary', 'keywords', 'marketingSegments', 'differentiators', 'contentThemes'],
  },
};

export interface ExtractPositioningOptions {
  apiKey: string;
  competitorName: string;
  homepageText: string | null;
  pages: SampledPage[];
  /** Domain Pack slice for the SYSTEM-prompt identity + voice. */
  pack: PromptBrand;
  /** Model alias (key into `drafting.models`). Defaults to `drafting.defaultModel`. */
  model?: string;
  /** Drafting config for the model map. Defaults to `defaultDraftingConfig`. */
  drafting?: DraftingConfig;
}

export async function extractPositioning(opts: ExtractPositioningOptions): Promise<Positioning> {
  const drafting = opts.drafting ?? defaultDraftingConfig;
  const alias = opts.model ?? drafting.defaultModel;
  const modelId = drafting.models[alias] ?? drafting.models[drafting.defaultModel] ?? alias;

  const pageBlock = opts.pages.length
    ? opts.pages
        .map(
          (p, i) => `--- Page ${i + 1}: ${p.url}
Title: ${p.title ?? '(no title)'}
H1: ${p.h1.join(' | ') || '(none)'}
H2: ${p.h2.join(' | ') || '(none)'}
Excerpt (first ~500 words):
${p.excerpt}`,
        )
        .join('\n\n')
    : '(no service/blog pages sampled)';

  const userMessage = `COMPETITOR: ${opts.competitorName}

HOMEPAGE MAIN CONTENT (~1500 words):
${opts.homepageText || '(homepage text not captured)'}

SAMPLED SERVICE/PRODUCT/BLOG PAGES (${opts.pages.length}):
${pageBlock}

Analyze this content and call extract_positioning.`;

  const reqBody = JSON.stringify({
    model: modelId,
    max_tokens: 4000,
    system: buildPositioningSystem(opts.pack),
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'extract_positioning' },
    messages: [{ role: 'user', content: userMessage }],
  });

  // Retry transient overload / rate-limit (529/429/503) with backoff.
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01' },
      body: reqBody,
    });
    if (res.ok) break;
    if ((res.status === 529 || res.status === 429 || res.status === 503) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) * (attempt + 1)));
      continue;
    }
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  if (!res || !res.ok) throw new Error('Anthropic request failed after retries');

  const data = (await res.json()) as {
    content: Array<{ type: string; name?: string; input?: Record<string, unknown> }>;
    stop_reason: string;
  };
  const toolUse = data.content.find((b) => b.type === 'tool_use' && b.name === 'extract_positioning');
  if (!toolUse?.input) throw new Error(`Model returned no positioning (stop_reason: ${data.stop_reason})`);
  const input = toolUse.input;

  // Coerce every list field to an array — the model occasionally returns a
  // non-array for one of these despite the tool schema.
  const asArr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const keywords = asArr<Record<string, unknown>>(input.keywords)
    .filter((k) => k && typeof k === 'object')
    .map((k) => {
      const intent = INTENTS.includes(k.intent as (typeof INTENTS)[number])
        ? (k.intent as Positioning['keywords'][number]['intent'])
        : 'informational';
      return {
        phrase: String(k.phrase ?? '').trim(),
        weight: Number(k.weight) || 0,
        intent,
      };
    })
    .filter((k) => k.phrase)
    .sort((a, b) => b.weight - a.weight);

  return {
    generatedAt: new Date().toISOString(),
    model: modelId,
    keywords,
    marketingSegments: asArr<string>(input.marketingSegments),
    differentiators: asArr<string>(input.differentiators),
    contentThemes: asArr<string>(input.contentThemes),
    summary: typeof input.summary === 'string' ? input.summary : '',
  };
}

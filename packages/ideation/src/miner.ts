/**
 * Transcript miner — spoken material in, prioritised article proposals out.
 *
 * Port of Body of Health `src/pages/api/admin/topics/episode.ts`. The prompt
 * and the tool schema both branch on the SHAPE of the source:
 *
 *   - `hasSourceUrl` — a published recording. Articles cross-promote it with a
 *     callout. For a private recording that block is wrong (it would put a
 *     "listen to the full conversation" callout pointing at nothing into every
 *     article), so it is swapped for a SOURCE MATERIAL block: the article
 *     stands alone, and what was said off the cuff is not a citation.
 *   - `hasTimestamps` — the start timestamp is required only when the source
 *     has a time base. Requiring it on an un-anchored paste makes the model
 *     invent one.
 *
 * Every string is built from the Domain Pack; nothing names a show, a person
 * or a vertical.
 */

import { defaultIdeationConfig, effortFor, resolveModelId, type TranscriptMinerConfig } from '@jeldon/config';
import type { LlmProvider, ToolDef } from '@jeldon/drafting';
import { backlogPromptBlocks, type TopicEntry } from './backlog.js';
import { formatTimestamp, prepareTranscript, type MineInput, type MinedSource, type TranscriptFetcher } from './transcript.js';
import { ideationVoiceBlock, primaryAuthorName, type IdeationPack, type InventoryArticle, type LlmUsage, type TopicProposal } from './types.js';

export const MINER_TOOL_NAME = 'propose_transcript_articles';

export function minerConfig(pack: IdeationPack): TranscriptMinerConfig {
  return { ...defaultIdeationConfig.transcriptMiner, ...(pack.ideation?.transcriptMiner ?? {}) };
}

export function buildMinerSystem(pack: IdeationPack, shape: { hasSourceUrl: boolean; hasTimestamps: boolean }): string {
  const cfg = minerConfig(pack);
  const author = primaryAuthorName(pack);
  const noun = cfg.publishedSourceNoun;
  const { hasSourceUrl, hasTimestamps } = shape;
  const max = hasSourceUrl ? cfg.maxProposals.published : cfg.maxProposals.private;

  const sourceBlock = hasSourceUrl
    ? `CROSS-PROMOTION GOAL — this is the whole point:
- Each proposal becomes an article that REFERENCES the ${noun} as additional listening, NOT a transcript or reproduction of it.
- The article stands alone as a written piece: it draws on the facts and ideas from the ${noun} but reorganises them into article structure (thesis, sections, examples, evidence). Spoken digressions get cut; implicit citations get researched and cited.
- The article includes a "${cfg.listenCalloutLabel}" callout linking to the ${noun}${hasTimestamps ? ' at the timestamp where the topic comes up' : ''}.${cfg.publishedSourceGuidance ? `\n${cfg.publishedSourceGuidance}` : ''}`
    : `SOURCE MATERIAL — this is ${author} talking, not a published ${noun}:
- The recording has no public URL. Articles mined from it stand entirely on their own: do NOT propose a "${cfg.listenCalloutLabel}" callout and do not reference a ${noun}. There is nothing to link to.
- Treat the transcript as ${author}'s raw thinking on the topic: the framing, the reasoning, the points chosen unprompted. That is the editorial spine worth keeping.
- The article is NOT a transcript. Spoken repetition, asides and half-finished thoughts get cut; the ideas get reorganised into article structure (thesis, sections, evidence).
- What is said off the cuff is not a citation. Every claim an article inherits from this transcript needs real published evidence behind it or the claim gets cut. ${author} may state something known from practice that the literature does support: flag that it needs a real source, never treat the spoken word as one.${cfg.privateSourceGuidance ? `\n${cfg.privateSourceGuidance}` : ''}`;

  const timestampFields = hasTimestamps
    ? `9. sourceTimestampStart — seconds (integer) where the topic begins in the recording
10. sourceTimestampEnd — seconds (integer) where it ends`
    : `9-10. This source carries no timestamps — OMIT sourceTimestampStart and sourceTimestampEnd entirely rather than guessing at them.`;

  return `You are a content strategist for ${pack.brand.name}${pack.brand.tagline ? ` (${pack.brand.tagline})` : ''}. You're mining ${
    hasSourceUrl ? `a published ${noun}` : `a transcript of ${author} talking (a video, a talk, a recording)`
  } for high-quality article opportunities.

Voice + editorial constraints the resulting articles must fit:
${ideationVoiceBlock(pack)}
- Citation discipline: if an article will reference studies, evidence, trials, guidelines or data, it must include a References section with real linked entries, or the claim is cut. Don't propose articles whose claims can't be backed by real published sources; the recording alone is not a citation.

${sourceBlock}

PROPOSAL OUTPUT (up to ${max} proposals):
1. suggestedTitle — the editorial version, in voice, reader-friendly
2. category — ${pack.content.categories.join(' | ')}
3. angle — 1 sentence editorial spine: what makes this NOT a generic answer
4. keyPoints — 3-5 bullets of what the article will cover
5. targetQuery — the actual search query a reader would type for this article
6. priority — high | medium | low
7. priorityRationale — 1 sentence on why
8. complementsExisting — slug of an existing live article this builds on, or omit if standalone
${timestampFields}
11. densityScore — 'strong' | 'medium' | 'weak'. Be honest. 'strong' = enough specific content for a real article. 'medium' = the topic is there but you'd be stretching without filler. 'weak' = mentioned in passing, would produce thin content.
12. relatedQueries — other queries this proposal would also rank for

PRIORITIZATION:
- HIGH: clear search intent, novel within the catalog, fits ${author}'s expertise, and the recording has SUBSTANTIVE coverage (not a passing reference).
- MEDIUM: search intent exists but the catalog overlaps, OR coverage is thinner.
- LOW: passing mention only, generic topic, or outside ${author}'s scope.

REJECT proposals where:
- The claim base is anecdotal and can't be backed by published sources the article would need to cite.
- The topic is outside ${author}'s scope${pack.voice.bannedTopics.length ? ` or touches a banned topic (${pack.voice.bannedTopics.join('; ')})` : ''}.
- The topic is already well covered in the live catalog without a meaningfully different angle.
- The density would be 'weak' AND the priority 'low' — just skip.

Aim for QUALITY over quantity. Three 'strong' proposals and two 'medium' beat eight reheated ones every time.`;
}

/** The tool schema. `sourceTimestampStart` is required only when the source has timestamps. */
export function buildMinerTool(pack: IdeationPack, hasTimestamps: boolean): ToolDef {
  return {
    name: MINER_TOOL_NAME,
    description: 'Return a prioritized set of article proposals mined from a spoken-word transcript.',
    input_schema: {
      type: 'object',
      properties: {
        proposals: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          items: {
            type: 'object',
            properties: {
              suggestedTitle: { type: 'string' },
              category: { type: 'string', enum: [...pack.content.categories] },
              angle: { type: 'string' },
              keyPoints: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
              targetQuery: { type: 'string' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              priorityRationale: { type: 'string' },
              complementsExisting: { type: 'string' },
              sourceTimestampStart: { type: 'integer', minimum: 0 },
              sourceTimestampEnd: { type: 'integer', minimum: 0 },
              densityScore: { type: 'string', enum: ['strong', 'medium', 'weak'] },
              relatedQueries: { type: 'array', items: { type: 'string' } },
            },
            // A required start second on a source with no time base makes the model invent one.
            required: [
              'suggestedTitle',
              'category',
              'angle',
              'keyPoints',
              'targetQuery',
              'priority',
              'priorityRationale',
              'densityScore',
              ...(hasTimestamps ? ['sourceTimestampStart'] : []),
            ],
          },
        },
        summary: {
          type: 'string',
          description: 'One paragraph: the arc of the recording, its themes, what you rejected and why.',
        },
      },
      required: ['proposals', 'summary'],
    },
  };
}

export function buildMinerUserMessage(args: {
  pack: IdeationPack;
  source: MinedSource;
  transcriptBlock: string;
  inventory: InventoryArticle[];
  backlog: Array<Pick<TopicEntry, 'suggestedTitle' | 'targetQuery' | 'status'>>;
}): string {
  const { pack, source, transcriptBlock, inventory, backlog } = args;
  const cfg = minerConfig(pack);
  const noun = cfg.publishedSourceNoun;
  const hasSourceUrl = Boolean(source.url);
  const header = hasSourceUrl
    ? `PUBLISHED ${noun.toUpperCase()}
Title: ${source.title ?? '(unknown)'}
Channel: ${source.channel ?? '(unknown)'}
Duration: ${source.durationSeconds ? formatTimestamp(source.durationSeconds) : 'unknown'}
Source URL: ${source.url}`
    : `RECORDING (not published anywhere, no URL to link)
Title: ${source.title ?? '(untitled)'}
Origin: ${source.kind}`;
  const inventoryBlock = inventory
    .map((a) => `- [${a.category ?? ''}${a.draft ? ', DRAFT' : ', LIVE'}] ${a.slug} — "${a.title}"${a.excerpt ? ` — ${a.excerpt}` : ''}`)
    .join('\n');
  const max = hasSourceUrl ? cfg.maxProposals.published : cfg.maxProposals.private;
  return `${header}

EXISTING ARTICLE INVENTORY (${inventory.length}):
${inventoryBlock || '(none yet)'}

${backlogPromptBlocks(backlog)}TRANSCRIPT${source.hasTimestamps ? ' (timestamped)' : ' (no timestamps)'}:
${transcriptBlock}

Mine this ${hasSourceUrl ? noun : 'recording'} for up to ${max} ARTICLE OPPORTUNITIES — distinct topics that each deserve their own standalone article on ${pack.brand.name}'s site.${
    hasSourceUrl
      ? ` Articles will reference the ${noun} as additional listening, not reproduce it.`
      : ` There is no ${noun} to link; each article stands alone.`
  } Score density honestly${hasSourceUrl ? '' : '; a short recording may only hold one or two real articles, and saying so beats padding the list'}. Skip overlap with the inventory and the saved/rejected backlog. Call ${MINER_TOOL_NAME}.`;
}

export interface MineDeps {
  provider: LlmProvider;
  pack: IdeationPack;
  /** Live + draft catalog, for de-duplication. */
  inventory?: InventoryArticle[];
  /** Saved/rejected backlog entries, so the miner respects the same memory. */
  backlog?: Array<Pick<TopicEntry, 'suggestedTitle' | 'targetQuery' | 'status'>>;
  /** URL resolvers (e.g. `YoutubeTranscriptFetcher`). */
  fetchers?: TranscriptFetcher[];
  model?: string;
}

export type MineResult =
  | {
      status: 'ok';
      proposals: TopicProposal[];
      summary: string;
      source: MinedSource;
      inventorySize: number;
      model: string;
      usage: LlmUsage;
    }
  | { status: 'invalid_input'; reason: string }
  | { status: 'fetch_failed'; reason: string }
  | { status: 'no_proposals'; reason: string; stopReason: string | null }
  | { status: 'error'; reason: string };

export async function mineTranscript(input: MineInput, deps: MineDeps): Promise<MineResult> {
  const cfg = minerConfig(deps.pack);
  const prepared = await prepareTranscript(input, {
    maxChars: cfg.maxChars,
    minChars: cfg.minChars,
    anchorEverySeconds: cfg.anchorEverySeconds,
    fetchers: deps.fetchers ?? [],
  });
  if (prepared.status !== 'ok') return prepared;
  const { source, transcriptBlock } = prepared;
  const shape = { hasSourceUrl: Boolean(source.url), hasTimestamps: source.hasTimestamps };
  const inventory = deps.inventory ?? [];
  const tool = buildMinerTool(deps.pack, shape.hasTimestamps);
  const modelId = resolveModelId(
    deps.pack.drafting?.models ?? {},
    deps.pack.drafting?.defaultModel ?? 'sonnet',
    deps.model ?? cfg.model,
  );

  let res;
  try {
    res = await deps.provider.complete({
      model: modelId,
      system: buildMinerSystem(deps.pack, shape),
      maxTokens: cfg.maxTokens,
      tools: [tool],
      toolName: tool.name,
      effort: effortFor(deps.pack.drafting, 'transcriptMiner'),
      messages: [
        {
          role: 'user',
          content: buildMinerUserMessage({ pack: deps.pack, source, transcriptBlock, inventory, backlog: deps.backlog ?? [] }),
        },
      ],
    });
  } catch (err) {
    return { status: 'error', reason: (err as Error).message };
  }

  const call = res.blocks.find((b) => b.type === 'tool_use' && b.name === tool.name);
  const payload = call && call.type === 'tool_use' ? (call.input as { proposals?: unknown; summary?: unknown }) : null;
  if (!payload || !Array.isArray(payload.proposals)) {
    return { status: 'no_proposals', reason: `Model returned no proposals (stop_reason: ${res.stopReason}).`, stopReason: res.stopReason };
  }

  const proposals = (payload.proposals as TopicProposal[])
    .filter((p) => p && typeof p.suggestedTitle === 'string')
    .map((p) => {
      const out: TopicProposal = { ...p, source: 'transcript', sourceKind: source.kind };
      if (source.url) out.sourceUrl = source.url;
      else delete out.sourceUrl;
      if (source.title) out.sourceTitle = source.title;
      if (!source.hasTimestamps) {
        // The schema did not ask for them; a model that sends one anyway is guessing.
        delete out.sourceTimestampStart;
        delete out.sourceTimestampEnd;
      }
      return out;
    });

  return {
    status: 'ok',
    proposals,
    summary: typeof payload.summary === 'string' ? payload.summary : '',
    source,
    inventorySize: inventory.length,
    model: res.model,
    usage: res.usage,
  };
}

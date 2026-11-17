/**
 * Reddit listening → article briefs.
 *
 * Port of Body of Health `src/pages/api/admin/topics/reddit.ts`. The
 * load-bearing input is the set of threads AI engines actually cite for the
 * tracked queries: a measured statement of what the engines consider the best
 * available answer. For an archived or old thread, publishing the page that
 * deserves the citation is the only lever left, so those are flagged
 * OUT-PUBLISH in the prompt. Topic-sub questions and local threads come along
 * as secondary input.
 *
 * Listening only: the output is briefs for articles on the brand's own site.
 * Threads are other people's stories; the prompt forbids retelling one as the
 * brand's own case.
 */

import type { Snapshot } from '@jeldon/aeo-audit';
import { effortFor, resolveModelId } from '@jeldon/config';
import type { LlmProvider, ToolDef } from '@jeldon/drafting';
import type { TopicEntry } from '../backlog.js';
import { ideationVoiceBlock, type IdeationPack, type InventoryArticle, type LlmUsage, type TopicProposal } from '../types.js';
import { redditConfig, type RadarSnapshot } from './radar.js';
import { ageInDays, citedThreadsFromSnapshot } from './targets.js';

export const REDDIT_BRIEF_TOOL_NAME = 'propose_backlog';

export function buildRedditBriefSystem(pack: IdeationPack): string {
  const name = pack.brand.name;
  return `You are a content strategist for ${name}${pack.brand.tagline ? ` (${pack.brand.tagline})` : ''}. You are given Reddit threads that AI answer engines currently cite when answering ${name}'s tracked search queries, plus recent reader questions from topic subreddits. You turn them into a prioritized article backlog for ${name}'s own site.

Why these threads matter: a cited Reddit thread is the engines' current best answer to a query ${name} wants to own. The goal is to publish a page so clearly better that the engine cites it instead. For each cited thread, ask: what page would deserve that citation more than a thread of anonymous anecdotes?

This is listening only. Never draft a Reddit reply, never suggest posting, commenting or seeding a thread. The output is articles for ${name}'s own site.

Voice + editorial constraints the articles must fit:
${ideationVoiceBlock(pack)}
- Never fabricate anecdotes. Reddit threads are OTHER people's stories: never retell one as if it were ${name}'s own case, client or customer. Use them only as evidence of what people ask and worry about.
- Articles that answer a query well lead with a direct, extractable answer, use question-style H2s, cite real sources, and carry a References section.

How to prioritize:
- HIGH: a cited thread on a query where ${name} has no strong page. Name the query.
- MEDIUM: a cited thread where an existing page could be strengthened instead of writing a new one (say which slug), or a recurring topic-sub question with no coverage.
- LOW: thin, off-topic, or already well covered.

Hard rules:
- A thread marked OUT-PUBLISH is likely archived or too old to reply to. Its brief is the page that out-publishes it: the definitive answer to the query the engines cite it for.
- If an existing article already covers the query, prefer "strengthen <slug>" over a new thin parallel page: put the slug in complementsExisting and say so in the angle.
- Cluster related threads/questions into ONE proposal. Do not emit one proposal per thread.
- Skip anything matching an already-saved or rejected backlog topic.
- Up to 10 proposals. Fewer, better briefs beat a long list. If everything is already covered, return an EMPTY proposals array and explain why in the summary; do not pad the list.`;
}

export function buildRedditBriefTool(pack: IdeationPack): ToolDef {
  return {
    name: REDDIT_BRIEF_TOOL_NAME,
    description: 'Return a prioritized backlog of article proposals derived from engine-cited Reddit threads and reader questions.',
    input_schema: {
      type: 'object',
      properties: {
        proposals: {
          type: 'array',
          // 0 on purpose: "skip what's covered" must be satisfiable without inventing a duplicate.
          minItems: 0,
          maxItems: 10,
          items: {
            type: 'object',
            properties: {
              targetQuery: { type: 'string', description: "The search query, in the reader's words." },
              suggestedTitle: { type: 'string', description: 'The editorial title, reader-friendly, in voice.' },
              category: { type: 'string', enum: [...pack.content.categories] },
              angle: { type: 'string', description: 'One sentence on the editorial spine.' },
              keyPoints: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              priorityRationale: { type: 'string', description: 'Why this priority; name the cited query and engine where relevant.' },
              complementsExisting: { type: 'string', description: 'Slug of an existing article to strengthen instead, or omit.' },
              relatedQueries: { type: 'array', items: { type: 'string' } },
              sourceThreads: { type: 'array', items: { type: 'string' }, description: 'Reddit permalinks this proposal came from.' },
              coreEvidenceClaim: { type: 'string', description: 'The most load-bearing claim the article must support. Omit if none.' },
            },
            required: ['targetQuery', 'suggestedTitle', 'category', 'angle', 'keyPoints', 'priority', 'priorityRationale'],
          },
        },
        summary: { type: 'string', description: 'One paragraph: what the engines cite, the pattern, what you rejected and why.' },
      },
      required: ['proposals', 'summary'],
    },
  };
}

/** A thread slug as a fallback title: /r/x/comments/id/some_title/ → "Some Title". */
export function titleFromThreadUrl(url: string): string {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean);
    const i = seg.indexOf('comments');
    const slug = i >= 0 ? seg[i + 2] : undefined;
    if (!slug) return url;
    return slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return url;
  }
}

export interface RedditBriefInput {
  radar: RadarSnapshot | null;
  aeo: Snapshot | null | undefined;
  inventory: InventoryArticle[];
  backlog: Array<Pick<TopicEntry, 'suggestedTitle' | 'targetQuery' | 'status'>>;
}

export interface RedditBriefDeps {
  provider: LlmProvider;
  pack: IdeationPack;
  model?: string;
  now?: number;
}

export type RedditBriefResult =
  | {
      status: 'ok';
      proposals: TopicProposal[];
      summary: string;
      citedThreadCount: number;
      outPublishCount: number;
      conditionQuestionCount: number;
      localThreadCount: number;
      aeoSnapshotDate: string | null;
      model: string;
      usage: LlmUsage;
    }
  | { status: 'not_configured'; reason: string }
  /** No cited threads and no questions: nothing to brief. Not "nothing worth writing". */
  | { status: 'no_signal'; reason: string }
  | { status: 'no_proposals'; reason: string; stopReason: string | null }
  | { status: 'error'; reason: string };

export function buildRedditBriefMessage(input: RedditBriefInput, pack: IdeationPack, now: number): {
  message: string;
  citedThreadCount: number;
  outPublishCount: number;
  conditionQuestionCount: number;
  localThreadCount: number;
} {
  const cfg = redditConfig(pack)!;
  const radarById = new Map((input.radar?.items ?? []).map((i) => [i.id.toLowerCase(), i]));
  const cited = citedThreadsFromSnapshot(input.aeo, pack);
  let outPublishCount = 0;
  const citedBlock = cited.length
    ? cited
        .map((c) => {
          const known = c.threadId ? radarById.get(c.threadId) : undefined;
          const age = ageInDays(known?.createdUtc, now);
          const outPublish = age != null && (age > cfg.archivedAfterDays || age > cfg.staleAfterDays);
          if (outPublish) outPublishCount++;
          const engines = [...new Set(c.citedBy.map((b) => b.engine))].join(', ');
          const queries = [...new Set(c.citedBy.map((b) => `"${b.query}"`))].join('; ');
          const status =
            age == null
              ? 'age unknown'
              : outPublish
                ? `${Math.round(age)} days old, likely archived: OUT-PUBLISH (you cannot reply; write the page that deserves this citation)`
                : `${Math.round(age)} days old`;
          return `- "${known?.title ?? titleFromThreadUrl(c.url)}"\n  ${c.url}\n  cited by ${engines} when answering: ${queries}\n  status: ${status}`;
        })
        .join('\n')
    : '(no reddit citations in the latest AEO snapshot)';
  const items = input.radar?.items ?? [];
  const conditionQs = items
    .filter((i) => i.kind === 'condition')
    .slice(0, 30)
    .map((i) => `- "${i.title}" (r/${i.subreddit})`);
  const localQs = items
    .filter((i) => i.kind === 'local-opportunity' || i.kind === 'evergreen')
    .slice(0, 20)
    .map((i) => `- "${i.title}" (r/${i.subreddit}${i.searchKey ? `, #${i.searchRank} all-time for ${i.searchKey}` : ''})`);
  const backlogBlock = input.backlog.length
    ? input.backlog.map((t) => `- [${t.status}] ${t.suggestedTitle || t.targetQuery}`).join('\n')
    : '(none)';
  const geo = pack.brand.geoFraming ? ` (${pack.brand.geoFraming})` : '';
  const message = `ENGINE-CITED REDDIT THREADS (the highest-signal input: the answers engines currently prefer):
${citedBlock}

READER QUESTIONS FROM TOPIC SUBREDDITS (their literal wording):
${conditionQs.length ? conditionQs.join('\n') : '(none captured)'}

LOCAL THREADS${geo}:
${localQs.length ? localQs.join('\n') : '(none captured)'}

EXISTING ARTICLES (${input.inventory.length}; do not propose duplicates, prefer strengthening one of these):
${input.inventory.map((a) => `- [${a.category ?? ''}] ${a.slug} — "${a.title}"`).join('\n') || '(none)'}

BACKLOG (already saved or rejected; skip overlaps):
${backlogBlock}

Produce up to 10 prioritized proposals (an empty list is a valid answer if everything is covered). For every proposal derived from a cited thread, put its permalink in sourceThreads and name the cited query in priorityRationale. Call ${REDDIT_BRIEF_TOOL_NAME}.`;
  return {
    message,
    citedThreadCount: cited.length,
    outPublishCount,
    conditionQuestionCount: conditionQs.length,
    localThreadCount: localQs.length,
  };
}

export async function proposeRedditBriefs(input: RedditBriefInput, deps: RedditBriefDeps): Promise<RedditBriefResult> {
  const cfg = redditConfig(deps.pack);
  if (!cfg) return { status: 'not_configured', reason: 'listening.reddit is not configured.' };
  const now = deps.now ?? Date.now();
  const built = buildRedditBriefMessage(input, deps.pack, now);
  if (!built.citedThreadCount && !built.conditionQuestionCount && !built.localThreadCount) {
    return {
      status: 'no_signal',
      reason: 'No Reddit signal yet: the radar needs a successful run, and engine-cited threads come from the AEO audit.',
    };
  }
  const tool = buildRedditBriefTool(deps.pack);
  const modelId = resolveModelId(deps.pack.drafting?.models ?? {}, deps.pack.drafting?.defaultModel ?? 'sonnet', deps.model ?? cfg.model);
  let res;
  try {
    res = await deps.provider.complete({
      model: modelId,
      system: buildRedditBriefSystem(deps.pack),
      maxTokens: cfg.maxTokens,
      tools: [tool],
      toolName: tool.name,
      effort: effortFor(deps.pack.drafting, 'redditBriefs'),
      messages: [{ role: 'user', content: built.message }],
    });
  } catch (err) {
    return { status: 'error', reason: (err as Error).message };
  }
  const call = res.blocks.find((b) => b.type === 'tool_use' && b.name === tool.name);
  const payload = call && call.type === 'tool_use' ? (call.input as { proposals?: unknown; summary?: unknown }) : null;
  if (!payload || !Array.isArray(payload.proposals)) {
    return { status: 'no_proposals', reason: `Model returned no backlog (stop_reason: ${res.stopReason}).`, stopReason: res.stopReason };
  }
  const proposals = (payload.proposals as TopicProposal[])
    .filter((p) => p && typeof p.suggestedTitle === 'string')
    .map((p) => ({ ...p, source: 'reddit' }));
  return {
    status: 'ok',
    proposals,
    summary: typeof payload.summary === 'string' ? payload.summary : '',
    citedThreadCount: built.citedThreadCount,
    outPublishCount: built.outPublishCount,
    conditionQuestionCount: built.conditionQuestionCount,
    localThreadCount: built.localThreadCount,
    aeoSnapshotDate: input.aeo?.date ?? null,
    model: res.model,
    usage: res.usage,
  };
}

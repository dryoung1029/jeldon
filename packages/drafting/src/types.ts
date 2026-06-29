/**
 * @jeldon/drafting — public contracts.
 *
 * Ported from Body of Health `src/pages/api/admin/author.ts` (the
 * score→verify→fix-pass draft loop + tool/mode shapes) and
 * `src/pages/api/admin/chat.ts` (the agentic citation-verifying editor chat).
 *
 * Two couplings broken here per docs/DECOUPLING-NOTES.md ("Voice block
 * duplicated ×4"):
 *   1. Anthropic is hardwired in BoH (`fetch('https://api.anthropic.com/...')`).
 *      It becomes the injectable `LlmProvider` interface — the default adapter
 *      (`AnthropicProvider`) is the only place a provider literal lives.
 *   2. Every prompt string (VOICE, GEO_DRAFTING_PLAYBOOK, the five mode prompts,
 *      the fix-pass prompt, the chat system prompt) is now BUILT from the Domain
 *      Pack's `voice` block by `PromptPack`, not a literal. A domain re-voices
 *      the whole pipeline by editing `pack.voice`.
 */

import type { DomainPack, DraftingConfig } from '@jeldon/config';

// ---------------------------------------------------------------------------
// LLM provider — the injectable boundary (replaces BoH's hardwired Anthropic
// fetch). One non-streaming call (drafting / claim extraction / fix-pass) and
// one streaming call (the editor-chat agentic loop). A test or a non-Anthropic
// host injects its own; the default is `AnthropicProvider`.
// ---------------------------------------------------------------------------

/** A tool definition handed to the model (Anthropic `tools` shape; provider-neutral). */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** One conversation message. */
export interface LlmMessage {
  role: 'user' | 'assistant';
  /** Plain text, OR a structured content array (tool_use / tool_result echo). */
  content: string | unknown[];
}

export interface LlmRequest {
  /** Resolved model id (the host maps an alias → id via `pack.drafting.models`). */
  model: string;
  system: string;
  messages: LlmMessage[];
  maxTokens: number;
  tools?: ToolDef[];
  /** Force a specific tool (`{ type: 'tool', name }`) or leave the model free. */
  toolChoice?: { type: 'tool'; name: string };
}

/** One returned content block — text or a tool call. */
export type LlmBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id?: string; name: string; input: Record<string, unknown> };

export interface LlmResponse {
  blocks: LlmBlock[];
  model: string;
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * A streamed block as it accumulates. `jsonAcc` is the partial tool-input JSON
 * (parse it once the stream ends). Mirrors BoH `chat.ts::StreamBlock`.
 */
export interface StreamBlock {
  type: 'text' | 'tool_use';
  id?: string;
  name?: string;
  text: string;
  jsonAcc: string;
}

export interface StreamTurn {
  ordered: StreamBlock[];
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number };
  modelOut: string;
}

/**
 * The provider boundary. Implementations: `AnthropicProvider` (default).
 * `complete` is one non-streaming round; `stream` is one streamed round (the
 * chat loop calls it repeatedly, replaying tool_results between rounds).
 */
export interface LlmProvider {
  complete(req: LlmRequest): Promise<LlmResponse>;
  stream(req: LlmRequest): Promise<StreamTurn>;
}

// ---------------------------------------------------------------------------
// Knowledge providers — getSiteKnowledge()'s data sources (replace BoH's
// `astro:content` getCollection + competitor-audits file reads). Behind an
// interface so the engine never imports Astro or GitHub directly.
// ---------------------------------------------------------------------------

/** One article inventory line for the knowledge base. */
export interface ArticleSummary {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  draft: boolean;
  series?: string;
  publishDate?: string;
}

/** A static IA page line (hand-curated per domain). */
export interface SitePageSummary {
  url: string;
  title: string;
  summary: string;
}

/** A cross-promotable source (BoH: curated PTCH podcast episodes). Optional. */
export interface CrossPromoSource {
  topic: string;
  url: string;
  match: string[];
  note: string;
}

/** A competitor priority keyword. Ported from BoH `PriorityKeywordHint`. */
export interface PriorityKeywordHint {
  phrase: string;
  totalWeight: number;
  competitors: string[];
  intents: string[];
}

/**
 * The data getSiteKnowledge() needs. Each method is best-effort — a thrown
 * error or empty return degrades the prompt gracefully (BoH returns [] on any
 * failure so authoring never breaks).
 */
export interface KnowledgeProviders {
  listArticles(): Promise<ArticleSummary[]>;
  /** Hand-curated static-page IA. Default: []. */
  listSitePages?(): Promise<SitePageSummary[]>;
  /** Cross-promo sources (podcast episodes, etc.). Default: []. */
  listCrossPromo?(): Promise<CrossPromoSource[]>;
  /** Top competitor priority keywords. Default: []. */
  priorityKeywords?(limit?: number): Promise<PriorityKeywordHint[]>;
  /** Learned editor preferences (voice memory) formatted for the prompt. Default: ''. */
  voiceMemoryBlock?(): Promise<string>;
}

// ---------------------------------------------------------------------------
// Drafting modes + context (BoH `author.ts`).
// ---------------------------------------------------------------------------

export type DraftMode =
  | 'brainstorm'
  | 'draft'
  | 'outline'
  | 'draft-series'
  | 'draft-series-article';

export interface DraftContext {
  mode: DraftMode;
  messages: LlmMessage[];
  /** Model alias (`sonnet` | `opus` | `haiku` | a raw id). Resolved via pack. */
  model?: string;
}

/** The single-article tool payload (BoH `create_draft`). */
export interface DraftResult {
  slug: string;
  content: string;
  summary: string;
}

/** The series-outline tool payload (BoH `propose_series`). */
export interface OutlineResult {
  seriesName: string;
  seriesTitle: string;
  seriesNote?: string;
  articles: Array<{
    title: string;
    slug: string;
    category: string;
    summary: string;
    keyPoints: string[];
  }>;
}

/** The full-series tool payload (BoH `create_series`). */
export interface SeriesResult {
  seriesName: string;
  articles: DraftResult[];
}

/** A computed SEO+GEO pair for one draft. */
export interface ScorePair {
  seo: number;
  geo: number;
}

// ---------------------------------------------------------------------------
// NDJSON event stream for `draft()`. The orchestration emits these as it runs;
// the host serializes one JSON object per line (BoH's author.ts streaming
// envelope + chat.ts's `progress`/`result`/`error` wire protocol, unified).
// ---------------------------------------------------------------------------

export type DraftEvent =
  | { type: 'progress'; pct: number; label: string; detail?: string }
  | {
      type: 'result';
      reply: string;
      draft?: DraftResult;
      outline?: OutlineResult;
      series?: SeriesResult;
      scores?: ScorePair | null;
      scoresSeries?: Array<(ScorePair & { slug: string }) | null> | null;
      fixPassFired?: boolean;
      fixPassesSeries?: number[];
      model: string;
      stopReason: string | null;
      usage: { input_tokens: number; output_tokens: number };
    }
  | { type: 'error'; error: string };

// ---------------------------------------------------------------------------
// Editor chat (BoH `chat.ts`).
// ---------------------------------------------------------------------------

export interface ChatSibling {
  slug: string;
  content: string;
}

export interface ChatSeoStatus {
  score: number;
  checks: Array<{ status: string; label: string; value: string }>;
}

export interface ChatContext {
  messages: LlmMessage[];
  articleContent: string;
  siblings?: ChatSibling[];
  seo?: ChatSeoStatus;
  model?: string;
}

/** The streamed chat wire protocol (BoH `chat.ts`). */
export type ChatEvent =
  | { type: 'progress'; pct: number; label: string; detail?: string }
  | {
      type: 'result';
      reply: string;
      newContent?: string;
      updates?: Array<{ slug: string; newContent: string }>;
      summary?: string;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    }
  | { type: 'error'; error: string };

// ---------------------------------------------------------------------------
// Frontmatter codec — `draft()` reads title/excerpt/tags/hero off a draft to
// score it. Injectable so a host with a real YAML codec (e.g. @jeldon/store's
// `defaultFrontmatterCodec`) reuses it; the package ships a crude default that
// matches the shape the drafting prompts emit.
// ---------------------------------------------------------------------------

export interface ParsedFrontmatter {
  title: string;
  excerpt: string;
  tags: string[];
  heroImage?: string;
  heroImageAlt?: string;
  body: string;
}

export interface DraftFrontmatterCodec {
  parse(markdown: string): ParsedFrontmatter;
}

/** The slice of the Domain Pack `draft()` / `chatEdit()` / `getSiteKnowledge()` read. */
export type DraftingPack = Pick<
  DomainPack,
  'brand' | 'authors' | 'voice' | 'content' | 'scoring' | 'citation' | 'schema'
> & {
  /** Optional drafting knobs (model alias map, prompt overrides). */
  drafting?: DomainPack extends { drafting?: infer D } ? D : never;
};

/**
 * @jeldon/drafting — portable article drafting + editor-chat orchestration.
 *
 * Ported from Body of Health `author.ts` (the score→verify→one-shot-fix-pass
 * draft loop), `chat.ts` (the agentic citation-verifying editor chat),
 * `site-knowledge.ts` + `priority-keywords.ts` (prompt injection), and
 * `voice-memory.ts` (learned-rules store). Every prompt string is built from
 * `pack.voice`; the LLM call, the verifier, the store, and the knowledge data
 * sources are all behind injectable interfaces.
 *
 * Public surface:
 *   - draft(ctx, deps)        — the NDJSON-event draft loop
 *   - chatEdit(ctx, deps)     — the agentic editor chat
 *   - getSiteKnowledge(pack, providers) — prompt-injection knowledge base
 *   - buildPromptPack(pack)   — every prompt string, built from pack.voice
 *   - VoiceMemory             — the @jeldon/store-backed learned-rules store
 *   - AnthropicProvider       — the default LlmProvider adapter
 */

export { draft, type DraftDeps } from './draft.js';
export { chatEdit, type ChatDeps } from './chat.js';

export {
  getSiteKnowledge,
  buildVoiceRules,
} from './site-knowledge.js';

export {
  buildPromptPack,
  buildVoice,
  buildGeoPlaybook,
  buildChatSystem,
  buildFixPassSystem,
  type PromptPack,
} from './prompts.js';

export {
  VoiceMemory,
  formatRulesForPrompt,
  DEFAULT_VOICE_MEMORY_PATH,
  type VoiceRule,
  type VoiceMemoryData,
} from './voice-memory.js';

export {
  AnthropicProvider,
  resolveModel,
  type AnthropicProviderOptions,
} from './provider.js';

export {
  scoreAndVerify,
  collectIssues,
  extractResearchClaims,
  formatReport,
} from './score-verify.js';

export {
  defaultDraftFrontmatterCodec,
  forcePublishDate,
  mergePreservingFrontmatter,
} from './frontmatter.js';

export { selectTags, reconcileTags } from './tags.js';

export {
  TOOLS_SINGLE,
  TOOLS_SERIES_DRAFT,
  toolsOutline,
  chatTools,
  TOOL_VERIFY_CITATION,
  TOOL_UPDATE_ARTICLE,
  TOOL_UPDATE_ARTICLES,
  EXTRACT_CLAIMS_TOOL,
} from './tools.js';

export type {
  // LLM provider
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmMessage,
  LlmBlock,
  StreamBlock,
  StreamTurn,
  ToolDef,
  // Knowledge
  KnowledgeProviders,
  ArticleSummary,
  SitePageSummary,
  CrossPromoSource,
  PriorityKeywordHint,
  // Drafting
  DraftMode,
  DraftContext,
  DraftResult,
  OutlineResult,
  SeriesResult,
  ScorePair,
  DraftEvent,
  // Chat
  ChatContext,
  ChatSibling,
  ChatSeoStatus,
  ChatEvent,
  // Frontmatter
  ParsedFrontmatter,
  DraftFrontmatterCodec,
  DraftingPack,
} from './types.js';

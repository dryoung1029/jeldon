/**
 * @jeldon/entity-presence — off-site brand-mention + per-engine citation-pattern
 * signals. The biggest AEO lever on-page-only optimization structurally cannot
 * reach: brand mentions across third-party sites (Reddit, Wikipedia, industry
 * forums, comparison pages) correlate ~3× stronger with AI visibility than
 * backlinks, and differ per engine (Reddit → Perplexity, Wikipedia/consensus →
 * ChatGPT, structured depth → Claude).
 *
 * NEW module — designed from docs/AEO-PLAYBOOK.md §"The biggest lever the
 * source system doesn't have yet"; nothing to port from Body of Health. The
 * control flow + rules are real and compiling; the one piece of host I/O
 * (off-site mention discovery) is behind `MentionProvider` with a
 * `NullMentionProvider` default — see `provider.ts`'s `TODO(port)` for the
 * SerpApi-backed first implementation.
 *
 * Capability flag: `capabilities.entityPresence`.
 *
 * Public API:
 *   - `checkMentionConsistency(brand, sources)` — NAP/name drift across sources.
 *   - `perEngineCitationPatterns(engine)` — what surfaces an engine leans on.
 *   - `entityPresenceReport(pack)` — the full off-site report + action items.
 */

export { checkMentionConsistency } from './consistency.js';
export { perEngineCitationPatterns, allEngineCitationPatterns } from './engine-patterns.js';
export {
  entityPresenceReport,
  buildActionItems,
  type PresencePack,
  type EntityPresenceReportOptions,
} from './report.js';
export {
  entityPresenceConfigFromPack,
  consistencyTargetsFromPack,
} from './pack.js';
export { NullMentionProvider, StaticMentionProvider } from './provider.js';

export type {
  OffSiteMention,
  BrandContract,
  MentionProvider,
  ConsistencyStatus,
  FieldConsistency,
  SourceConsistency,
  MentionConsistencyReport,
  EngineCitationPattern,
  PresenceActionItem,
  EntityPresenceReport,
  EntityPresenceSource,
  EnginePresenceAffinity,
  MentionConsistencyTargets,
} from './types.js';

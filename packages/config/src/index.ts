export type {
  DomainPack,
  OrgProfile,
  PersonProfile,
  ArticleSchemaPolicy,
  LlmsTxtConfig,
  LlmsTxtSection,
  ScoringConfig,
  SeoConfig,
  GeoConfig,
  GeoCheckDef,
  CitationConfig,
  AeoConfig,
  AeoQuery,
  CompetitorsConfig,
  CompetitorEntry,
  StrategyConfig,
  StrategyThresholds,
  StrategyRefererGroups,
  DraftingConfig,
  AmplifyConfig,
  AmplifyChannel,
  CarouselScheme,
  MediaConfig,
  NarrationConfig,
  HeroImageConfig,
  PodcastConfig,
  PodcastTrailer,
  VoiceSettings,
  PronunciationOverride,
  AbbreviationExpansion,
  AnalyticsConfig,
  AiBot,
  RefererChannelRule,
  EntityPresenceConfig,
  EntityPresenceSource,
  EnginePresenceAffinity,
  MentionConsistencyTargets,
} from './types.js';

export { domainPackSchema, type DomainPackInput } from './schema.js';
export {
  defaultScoringConfig,
  defaultGeoConfig,
  defaultSeoConfig,
  defaultStrategyConfig,
  defaultDraftingConfig,
  defaultAmplifyConfig,
  defaultMediaConfig,
  defaultAnalyticsConfig,
  defaultEntityPresenceConfig,
} from './defaults.js';
export { validateDomainPack, defineDomainPack, type ValidateResult } from './validate.js';
export {
  articlePathPrefix,
  articlePath,
  articlePathPattern,
  articlePathSegment,
  authorUrlPrefix,
  authorPath,
  normalizePrefix,
  DEFAULT_ARTICLE_PATH_PREFIX,
  DEFAULT_AUTHOR_URL_PREFIX,
} from './paths.js';
export { draftingMode, type DraftingMode } from './capabilities.js';
export { resolveStrategyConfig, resolveAnalyticsConfig, articleRoute404Pattern } from './resolve.js';

import type { DomainPack } from './types.js';

/**
 * @deprecated Import `loadDomainPack` from `@jeldon/config/load` instead. The
 * loader needs jiti + `node:fs`; keeping it on the root export dragged both
 * into Cloudflare Worker bundles (Helix finding #8). This shim stays for one
 * release: it defers to the `./load` entry through a dynamic import so the
 * root's static import graph is `node:`-free. Removed in 0.3.
 */
export async function loadDomainPack(opts: { cwd?: string; path?: string } = {}): Promise<DomainPack> {
  const mod = await import('./load.js');
  return mod.loadDomainPack(opts);
}

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
  LlmEffort,
  AmplifyConfig,
  AmplifyChannel,
  CtaPolicy,
  CarouselStudioConfig,
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
export {
  loadDomainPack,
  validateDomainPack,
  resolveConfigPath,
  defineDomainPack,
  type ValidateResult,
} from './load.js';
export {
  TOOL_CHOICE_AUTO,
  WEB_SEARCH_TOOL_TYPE,
  useToolInstruction,
  resolveModelId,
  effortFor,
  singleToolRequest,
} from './llm.js';
export { hostOf, hostIs, termRegex, mentionsTerm } from './match.js';

// Ops observability (@jeldon/ops)
export type {
  OpsConfig,
  OpsPipeline,
  OpsPipelineRun,
  OpsGrading,
  OpsCadence,
  OpsDispatch,
  OpsLink,
} from './types.js';
export { defaultOpsConfig, defaultOpsDispatchTiming } from './defaults.js';

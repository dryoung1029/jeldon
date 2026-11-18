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
  AeoCitationConfig,
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
  TopicCluster,
  TopicClustersConfig,
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
  SearchConsoleConfig,
  StrikingDistanceConfig,
  LowCtrConfig,
  SnippetLabConfig,
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
  defaultSearchConsoleConfig,
  defaultAeoCitationConfig,
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
export type {
  LeadsConfig,
  LeadAttributionConfig,
  BookingImportConfig,
  BookingImportPreset,
  ConversionConfig,
  RequestContext,
  MailboxComplianceConfig,
  MailboxOutcomeRules,
  MailboxRule,
} from './types.js';
export { defaultLeadsConfig, defaultConversionConfig, defaultMailboxOutcomeRules } from './defaults.js';
// Site ops: site alert, admin access, business hours.
export type {
  BrandContact,
  DayName,
  HoursInterval,
  DayHours,
  SpecialHours,
  HoursData,
  BusinessHoursConfig,
  PlacesServiceConfig,
  SiteAlertLimits,
  SiteAlertPreset,
  SiteAlertConfig,
  AccessPolicyConfig,
  SecurityConfig,
} from './types.js';
export { defaultSiteAlertConfig, defaultSecurityConfig } from './defaults.js';
// Ideation, listening, autonomous drafting, backlinks.
export type {
  IdeationConfig,
  TranscriptMinerConfig,
  TopicBacklogConfig,
  ListeningConfig,
  RedditListeningConfig,
  RedditTargetSearch,
  RecencyBand,
  AutonomousDraftingConfig,
  BacklinksConfig,
} from './types.js';
export {
  defaultIdeationConfig,
  defaultRedditListeningConfig,
  defaultAutonomousDraftingConfig,
  defaultBacklinksConfig,
} from './defaults.js';

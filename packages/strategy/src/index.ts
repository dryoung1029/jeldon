export { buildRecommendations, defaultRuleSet, type BuildOptions } from './engine.js';
export { fill } from './templating.js';
export type {
  Priority,
  RecommendationCategory,
  Recommendation,
  ArticleHealth,
  CfWindow,
  CrawlerActivity,
  StrategyInput,
  BuiltinRuleId,
  RuleToggle,
  RuleSet,
} from './types.js';

// Re-export the strategy tuning surface from config for convenience, so callers
// can `import { defaultStrategyConfig } from '@jeldon/strategy'`.
export {
  defaultStrategyConfig,
  type StrategyConfig,
  type StrategyThresholds,
  type StrategyRefererGroups,
} from '@jeldon/config';

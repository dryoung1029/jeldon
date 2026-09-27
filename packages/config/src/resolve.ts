/**
 * Resolve the optional per-module config blocks against their defaults AND
 * the pack's URL layout. The shipped defaults describe `/articles/`; a pack
 * that publishes under `/blog/` (Helix) gets the derived patterns without
 * hand-copying the whole strategy/analytics block. Pure.
 */
import { defaultAnalyticsConfig, defaultStrategyConfig } from './defaults.js';
import { articlePathPattern, articlePathPrefix } from './paths.js';
import type { AnalyticsConfig, DomainPack, StrategyConfig } from './types.js';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `^/<prefix>/[a-z0-9-]+/?$` — the site-route-404 family for articles. */
export function articleRoute404Pattern(pack?: Pick<DomainPack, 'content'> | null): string {
  const prefix = articlePathPrefix(pack).replace(/\/$/, '');
  return `^${escapeRegex(prefix)}/[a-z0-9-]+/?$`;
}

/** `pack.strategy`, or the defaults re-pointed at the pack's article prefix. */
export function resolveStrategyConfig(pack: Pick<DomainPack, 'content' | 'strategy'>): StrategyConfig {
  if (pack.strategy) return pack.strategy;
  const prefix = articlePathPrefix(pack);
  if (prefix === '/articles/') return defaultStrategyConfig;
  return {
    ...defaultStrategyConfig,
    articlePathPattern: `^${escapeRegex(prefix.replace(/\/$/, ''))}/([^/]+)$`,
    siteRoute404Patterns: [
      articleRoute404Pattern(pack),
      ...defaultStrategyConfig.siteRoute404Patterns.filter((p) => !p.startsWith('^/articles/')),
    ],
  };
}

/** `pack.analytics`, or the defaults re-pointed at the pack's article prefix. */
export function resolveAnalyticsConfig(pack: Pick<DomainPack, 'content' | 'analytics'>): AnalyticsConfig {
  if (pack.analytics) return pack.analytics;
  const prefix = articlePathPrefix(pack);
  if (prefix === '/articles/') return defaultAnalyticsConfig;
  return {
    ...defaultAnalyticsConfig,
    articlePathPattern: articlePathPattern(pack),
    siteRoute404Patterns: [
      articleRoute404Pattern(pack),
      ...defaultAnalyticsConfig.siteRoute404Patterns.filter((p) => !p.startsWith('^/articles/')),
    ],
  };
}

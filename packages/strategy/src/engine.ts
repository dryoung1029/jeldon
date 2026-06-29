// Strategic recommendations engine. Pure + deterministic — joins edge analytics
// (traffic, sources, status), AI-crawler activity, per-article GEO/SEO/audio
// health, and keyword ranks into a prioritized, evidence-backed action list.
// No AI call; transparent and free per load.
//
// Ported faithfully from Body of Health `src/lib/admin/strategy.ts`. Every
// domain literal (thresholds, the SITE_ROUTE_404 regexes, referer needle
// groups, deep-links, evidence/title copy) is read from StrategyConfig; the
// audio/podcast and AEO rules are opt-in via the RuleSet. Same engine + a
// different pack ⇒ different output, with zero code change.

import {
  defaultStrategyConfig,
  type StrategyConfig,
} from '@jeldon/config';
import { fill } from './templating.js';
import type {
  ArticleHealth,
  BuiltinRuleId,
  Priority,
  Recommendation,
  RuleSet,
  StrategyInput,
} from './types.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function compileRoutes(patterns: string[]): RegExp[] {
  return patterns.map((p) => new RegExp(p, 'i'));
}

const sumWhere = (
  refs: Array<{ source: string; requests: number }>,
  needles: string[],
): number =>
  refs
    .filter((r) => needles.some((n) => r.source.toLowerCase().includes(n)))
    .reduce((a, r) => a + r.requests, 0);

/** GEO target for a content category. Reuses `content.categoryTargets` from the
 *  pack (passed in by the host); falls back to 80 — the BoH default for an
 *  unknown category. */
function geoTarget(category: string, categoryTargets: Record<string, number>): number {
  return categoryTargets[category] ?? 80;
}

// ── Rule context ────────────────────────────────────────────────────────

interface RuleCtx {
  input: StrategyInput;
  cfg: StrategyConfig;
  categoryTargets: Record<string, number>;
  bySlug: Map<string, ArticleHealth>;
  siteRoute404: RegExp[];
  articlePathRe: RegExp;
}

type RuleFn = (ctx: RuleCtx) => Recommendation[];

function deepLink(cfg: StrategyConfig, slot: string, tokens: Record<string, string | number> = {}) {
  const dl = cfg.deepLinks[slot];
  if (!dl) return {};
  return { link: fill(dl.link, tokens), linkLabel: dl.linkLabel };
}

function copyOf(cfg: StrategyConfig, id: string, tokens: Record<string, string | number>) {
  const c = cfg.copy[id] ?? { title: id, evidence: '' };
  return { title: fill(c.title, tokens), evidence: fill(c.evidence, tokens) };
}

// ── Built-in rules ──────────────────────────────────────────────────────
// Each mirrors a BoH `strategy.ts` block; the original line range is noted.

// strategy.ts:96-112 — 404s on REAL paths (positive-match, noise excluded).
const rule404: RuleFn = ({ input, cfg, siteRoute404 }) => {
  const cf = input.cf;
  if (!cf || (cf.top404Paths?.length ?? 0) === 0) return [];
  const t = cfg.thresholds;
  const realOffenders = (cf.top404Paths ?? [])
    .filter((p) => siteRoute404.some((re) => re.test(p.path)) && p.requests >= t.real404MinRequests)
    .sort((a, b) => b.requests - a.requests);
  if (!realOffenders.length) return [];
  const offenders = realOffenders.slice(0, 4).map((p) => `${p.path} (${p.requests})`).join(', ');
  const top = realOffenders[0];
  if (!top) return [];
  const priority: Priority = top.requests >= t.real404HighRequests ? 'high' : 'medium';
  return [
    {
      id: 'health-404',
      priority,
      category: 'health',
      ...copyOf(cfg, 'health-404', { offenders }),
      ...deepLink(cfg, 'brokenLinks'),
    },
  ];
};

// strategy.ts:113-132 — server/origin 5xx errors.
const rule5xx: RuleFn = ({ input, cfg }) => {
  const cf = input.cf;
  if (!cf || !cf.statuses.length) return [];
  const t = cfg.thresholds;
  const serverErr = cf.statuses
    .filter((s) => s.status >= 500 && s.status <= 599)
    .reduce((a, s) => a + s.requests, 0);
  if (serverErr < t.serverError5xxMin) return [];
  const detail = cf.statuses
    .filter((s) => s.status >= 500)
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 3)
    .map((s) => `${s.status}×${s.requests}`)
    .join(', ');
  const priority: Priority = serverErr >= t.serverError5xxHigh ? 'high' : 'medium';
  return [
    {
      id: 'health-5xx',
      priority,
      category: 'health',
      ...copyOf(cfg, 'health-5xx', { count: serverErr, windowDays: cf.windowDays, detail }),
    },
  ];
};

// strategy.ts:135-167 (GEO half) — high-traffic pages with low citability.
const ruleGeoCitability: RuleFn = ({ input, cfg, categoryTargets, bySlug, articlePathRe }) => {
  const cf = input.cf;
  if (!cf) return [];
  const t = cfg.thresholds;
  const out: Recommendation[] = [];
  const contentPaths = cf.topPaths
    .map((p) => ({ ...p, slug: slugFromPath(p.path, articlePathRe) }))
    .filter((p) => p.slug && bySlug.has(p.slug));
  let rank = 0;
  for (const p of contentPaths.slice(0, t.topContentPaths)) {
    rank += 1;
    const a = bySlug.get(p.slug as string);
    if (!a) continue;
    const target = geoTarget(a.category, categoryTargets);
    if (a.geo < target - t.geoTargetMargin) {
      out.push({
        id: `geo-${a.slug}`,
        priority: rank <= t.geoHighTopRank ? 'high' : 'medium',
        category: 'aeo',
        ...copyOf(cfg, 'geo-citability', {
          title: a.title,
          requests: p.requests,
          windowDays: cf.windowDays,
          geo: a.geo,
          target,
          category: a.category,
        }),
        ...deepLink(cfg, 'editArticle', { slug: a.slug }),
      });
    }
  }
  return out;
};

// strategy.ts:135-167 (audio half) — top pages with no narration. Opt-in.
const ruleAudioCoverage: RuleFn = ({ input, cfg, bySlug, articlePathRe }) => {
  const cf = input.cf;
  if (!cf) return [];
  const t = cfg.thresholds;
  const out: Recommendation[] = [];
  const contentPaths = cf.topPaths
    .map((p) => ({ ...p, slug: slugFromPath(p.path, articlePathRe) }))
    .filter((p) => p.slug && bySlug.has(p.slug));
  let rank = 0;
  for (const p of contentPaths.slice(0, t.topContentPaths)) {
    rank += 1;
    const a = bySlug.get(p.slug as string);
    if (!a) continue;
    if (rank <= t.audioTopRank && !a.hasAudio) {
      out.push({
        id: `audio-${a.slug}`,
        priority: 'low',
        category: 'content',
        ...copyOf(cfg, 'audio-coverage', { title: a.title, rank }),
        ...deepLink(cfg, 'editArticle', { slug: a.slug }),
      });
    }
  }
  return out;
};

// strategy.ts:170-185 — social-referral gap → amplify.
const ruleDistSocial: RuleFn = ({ input, cfg }) => {
  const cf = input.cf;
  if (!cf || !cf.referrers.length) return [];
  const t = cfg.thresholds;
  const totalRef = cf.referrers.reduce((a, r) => a + r.requests, 0);
  const social = sumWhere(cf.referrers, cfg.refererGroups.social);
  const search = sumWhere(cf.referrers, cfg.refererGroups.search);
  if (totalRef > t.socialMinReferrers && social <= Math.max(t.socialGapFloor, totalRef * t.socialGapFraction)) {
    return [
      {
        id: 'dist-social',
        priority: 'medium',
        category: 'distribution',
        ...copyOf(cfg, 'dist-social', { social, search, referrersDays: cf.referrersDays }),
        ...deepLink(cfg, 'amplify'),
      },
    ];
  }
  return [];
};

// strategy.ts:188-203 — page-2→1 organic climb opportunities.
const ruleSeoClimb: RuleFn = ({ input, cfg }) => {
  const cf = input.cf;
  if (!cf || sumWhere(cf.referrers, cfg.refererGroups.search) <= 0) return [];
  const t = cfg.thresholds;
  const [lo, hi] = t.climbRankRange;
  const climbers = input.keywords
    .filter((k) => k.ourRank != null && k.ourRank >= lo && k.ourRank <= hi)
    .slice(0, t.climbMax);
  return climbers.map((k) => ({
    id: `climb-${k.keyword}`,
    priority: 'medium' as Priority,
    category: 'seo' as const,
    ...copyOf(cfg, 'seo-climb', { keyword: k.keyword, rank: k.ourRank as number }),
    ...deepLink(cfg, 'priorityKeywords'),
  }));
};

// strategy.ts:206-219 — live-retrieval crawlers → verify citations. Opt-in.
const ruleAeoLiveCrawl: RuleFn = ({ input, cfg }) => {
  const crawlers = input.crawlers;
  if (!crawlers || crawlers.totalHits <= 0) return [];
  const live = crawlers.bots
    .filter((b) => b.purpose === cfg.liveCrawlPurpose)
    .reduce((a, b) => a + b.count, 0);
  if (live <= 0) return [];
  return [
    {
      id: 'aeo-live',
      priority: 'low',
      category: 'aeo',
      ...copyOf(cfg, 'aeo-live-crawl', { live }),
    },
  ];
};

function slugFromPath(path: string, articlePathRe: RegExp): string | null {
  const m = path.replace(/\/+$/, '').match(articlePathRe);
  return m && m[1] ? m[1] : null;
}

const BUILTIN_RULES: Record<BuiltinRuleId, RuleFn> = {
  'health-404': rule404,
  'health-5xx': rule5xx,
  'geo-citability': ruleGeoCitability,
  'audio-coverage': ruleAudioCoverage,
  'dist-social': ruleDistSocial,
  'seo-climb': ruleSeoClimb,
  'aeo-live-crawl': ruleAeoLiveCrawl,
};

/** Default rule set. Mirrors the BoH engine, which always ran every block; here
 *  the audio/podcast and AEO-live rules ship ON only because BoH had those
 *  surfaces. A domain without audio or answer-engine ambitions disables them. */
export const defaultRuleSet: RuleSet = {
  rules: [
    { id: 'health-404', enabled: true },
    { id: 'health-5xx', enabled: true },
    { id: 'geo-citability', enabled: true },
    { id: 'audio-coverage', enabled: false }, // opt-in (podcast/audio surface)
    { id: 'dist-social', enabled: true },
    { id: 'seo-climb', enabled: true },
    { id: 'aeo-live-crawl', enabled: false }, // opt-in (answer-engine surface)
  ],
};

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export interface BuildOptions {
  /** Pack `content.categoryTargets`. Supplies the per-category GEO target the
   *  citability rule compares against. Defaults to {} (every category → 80). */
  categoryTargets?: Record<string, number>;
  /** Strategy tuning. Defaults to `defaultStrategyConfig`. */
  cfg?: StrategyConfig;
}

/**
 * Build the prioritized recommendation list.
 *
 * @param input  The joined analytics + article-health + keyword snapshot.
 * @param ruleSet  Which rules run (audio/AEO are opt-in). Defaults to
 *                 `defaultRuleSet`.
 * @param opts  `{ categoryTargets, cfg }`. `categoryTargets` is normally
 *              `pack.content.categoryTargets`; `cfg` is `pack.strategy`.
 */
export function buildRecommendations(
  input: StrategyInput,
  ruleSet: RuleSet = defaultRuleSet,
  opts: BuildOptions = {},
): Recommendation[] {
  const cfg = opts.cfg ?? defaultStrategyConfig;
  const categoryTargets = opts.categoryTargets ?? {};

  const ctx: RuleCtx = {
    input,
    cfg,
    categoryTargets,
    bySlug: new Map(input.articles.map((a) => [a.slug, a])),
    siteRoute404: compileRoutes(cfg.siteRoute404Patterns),
    articlePathRe: new RegExp(cfg.articlePathPattern),
  };

  const recs: Recommendation[] = [];
  for (const toggle of ruleSet.rules) {
    if (!toggle.enabled) continue;
    const fn = BUILTIN_RULES[toggle.id as BuiltinRuleId];
    if (!fn) continue; // unknown/host-defined id with no built-in — skip safely
    recs.push(...fn(ctx));
  }

  return recs
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, cfg.thresholds.maxRecommendations);
}

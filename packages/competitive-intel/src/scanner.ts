import type { GeoConfig } from '@jeldon/config';
import { defaultGeoConfig } from '@jeldon/config';
import { calculateGeo } from '@jeldon/core-scoring';
import { defaultScannerConfig, type ScannerConfig } from './config.js';
import { defaultFetcher } from './fetcher.js';
import {
  extractSchema,
  htmlToScorableMarkdown,
  originOf,
  pick,
  stripTags,
} from './html.js';
import type {
  CompetitorAudit,
  Fetcher,
  GapSignal,
  GbpAudit,
  HomepageAudit,
  PageSpeedAudit,
  PageSpeedScores,
  PageStats,
  RobotsAudit,
  SampledPage,
  SchemaAudit,
  SitemapAudit,
  TemplateVendor,
} from './types.js';

/**
 * Competitor website auditor. Pure-fetch (no headless browser) — homepage HTML
 * + sitemap + PageSpeed Insights + Google Places. This is THE single source the
 * DECOUPLING-NOTES row demands: the Astro Function and the Node cron both import
 * `runAudit` from here, so the TS-lib ↔ JS-cron mirror that drifted in BoH
 * cannot exist. Every domain literal (UA, high-value/skip URL patterns, vendor
 * fingerprints, the GEO scoring weights) is config-driven.
 */

const RANK_UA = 'Mozilla/5.0 (compatible; JeldonCompetitiveIntelBot/1.0)';

// ---------- GEO citability scoring (reuses @jeldon/core-scoring) ----------

/** Score a competitor HTML page on the same weighted GEO checks articles use.
 *  Reuses @jeldon/core-scoring — we do NOT re-implement the scorer here (the #1
 *  hazard the catalog calls out). `geo` defaults to the canonical health pack
 *  but a host threads `pack.scoring.geo` so a different vertical scores its own way. */
export function geoScoreHtml(
  html: string,
  geo: GeoConfig = defaultGeoConfig,
): { score: number; badCount: number; mehCount: number } {
  const body = htmlToScorableMarkdown(html);
  const r = calculateGeo(
    { title: '', excerpt: '', tags: [], body, slug: 'competitor-homepage' },
    geo,
  );
  return { score: r.score, badCount: r.badCount, mehCount: r.mehCount };
}

// ---------- Homepage scan ----------

export async function auditHomepage(
  rawUrl: string,
  opts: { fetcher: Fetcher; geo?: GeoConfig },
): Promise<HomepageAudit | { error: string }> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const fetched = await opts.fetcher.fetchHtml(url);
  if (!fetched.html)
    return {
      error: fetched.error
        ? `Fetch failed: ${fetched.error}`
        : `Fetch failed (status ${fetched.status})`,
    };
  const finalUrl = fetched.finalUrl || url;
  const html = fetched.html;

  const ogTag = (prop: string) =>
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i').test(html);
  const twTag = (name: string) =>
    new RegExp(`<meta[^>]+name=["']twitter:${name}["'][^>]*content=["']([^"']+)["']`, 'i').test(html);

  const h1s = Array.from(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
    .map((m) => stripTags(m[1] ?? ''))
    .filter(Boolean);
  const h2Count = (html.match(/<h2\b/gi) ?? []).length;
  const text = stripTags(html);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const imgs = Array.from(html.matchAll(/<img\b[^>]*>/gi));
  const imagesWithAlt = imgs.filter((m) => /\salt=["'][^"']+["']/i.test(m[0])).length;

  const links = Array.from(html.matchAll(/<a\b[^>]*\shref=["']([^"']+)["']/gi)).map((m) => m[1] ?? '');
  const origin = originOf(finalUrl);
  let internalLinks = 0;
  let externalLinks = 0;
  for (const href of links) {
    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:')
    )
      continue;
    if (href.startsWith('/') || (origin && href.startsWith(origin))) internalLinks++;
    else if (/^https?:\/\//i.test(href)) externalLinks++;
  }

  const geo = geoScoreHtml(html, opts.geo);

  return {
    url,
    finalUrl,
    status: fetched.status,
    fetchedVia: fetched.via,
    proxyError: fetched.proxyError,
    htmlBytes: html.length,
    title: pick(/<title[^>]*>([\s\S]*?)<\/title>/i, html),
    metaDescription: pick(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i, html),
    canonicalUrl: pick(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i, html),
    lang: pick(/<html[^>]+lang=["']([^"']+)["']/i, html),
    viewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    h1: h1s.slice(0, 5),
    h2Count,
    wordCount,
    imageCount: imgs.length,
    imagesWithAlt,
    internalLinks,
    externalLinks,
    ogTags: {
      title: ogTag('og:title'),
      description: ogTag('og:description'),
      image: ogTag('og:image'),
      url: ogTag('og:url'),
      type: ogTag('og:type'),
    },
    twitterTags: { card: twTag('card'), title: twTag('title'), image: twTag('image') },
    favicon: /<link[^>]+rel=["'](?:shortcut )?icon["']/i.test(html),
    hasBlogHint:
      /\/(blog|articles|news|posts)(\/|["'])/i.test(html) || /\bblog\b/i.test(text.slice(0, 4000)),
    hasFaqHint:
      /\b(faq|frequently asked|common questions|questions we get|things (patients|people) ask|questions answered)\b/i.test(
        text,
      ) || /"@type"\s*:\s*"FAQPage"/i.test(html),
    hasTeamHint: /\b(our team|about us|meet (the|our) (doctor|team)|providers)\b/i.test(text),
    geoScore: geo.score,
    geoBadCount: geo.badCount,
    geoMehCount: geo.mehCount,
  };
}

// ---------- Sitemap + robots ----------

export async function auditSitemap(siteUrl: string): Promise<SitemapAudit> {
  const origin = originOf(siteUrl);
  if (!origin) return { found: false, url: null, urlCount: 0, lastmod: null };
  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': RANK_UA } });
      if (!res.ok) continue;
      const xml = await res.text();
      const childSitemaps = Array.from(xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>/gi)).map(
        (m) => (m[1] ?? '').trim(),
      );
      let urlCount = Array.from(xml.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>/gi)).length;
      const lastmods = Array.from(xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/gi)).map((m) =>
        (m[1] ?? '').trim(),
      );
      for (const child of childSitemaps.slice(0, 10)) {
        // Rewrite child host to the origin we're auditing — sitemaps can bake
        // a build-time `site:` that points at production even on a preview.
        let childUrl = child;
        try {
          childUrl = new URL(new URL(child).pathname, origin).toString();
        } catch {
          /* keep literal */
        }
        try {
          const cres = await fetch(childUrl, { headers: { 'User-Agent': RANK_UA } });
          if (!cres.ok) continue;
          const cxml = await cres.text();
          urlCount += Array.from(cxml.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>/gi)).length;
          for (const m of cxml.matchAll(/<lastmod>([^<]+)<\/lastmod>/gi)) lastmods.push((m[1] ?? '').trim());
        } catch {
          /* skip child */
        }
      }
      lastmods.sort();
      return { found: true, url, urlCount, lastmod: lastmods.length ? (lastmods[lastmods.length - 1] ?? null) : null };
    } catch {
      /* try next */
    }
  }
  return { found: false, url: null, urlCount: 0, lastmod: null };
}

export async function auditRobots(siteUrl: string): Promise<RobotsAudit> {
  const origin = originOf(siteUrl);
  if (!origin) return { found: false, blocksRoot: false };
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': RANK_UA } });
    if (!res.ok) return { found: false, blocksRoot: false };
    const txt = await res.text();
    const blocksRoot = /User-agent:\s*\*[\s\S]*?Disallow:\s*\/\s*(\n|$)/i.test(txt);
    return { found: true, blocksRoot };
  } catch {
    return { found: false, blocksRoot: false };
  }
}

// ---------- PageSpeed Insights ----------

export async function auditPageSpeed(siteUrl: string, apiKey?: string): Promise<PageSpeedAudit> {
  const base = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
  const cats = '&category=performance&category=seo&category=accessibility&category=best-practices';
  const key = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';

  type OneResult =
    | { scores: PageSpeedScores; lcp: number | null; cls: number | null; fcp: number | null }
    | { err: string };

  async function one(strategy: 'mobile' | 'desktop'): Promise<OneResult> {
    const url = `${base}?url=${encodeURIComponent(siteUrl)}&strategy=${strategy}${cats}${key}`;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) return { err: `PSI ${strategy} ${res.status}` };
      const data = (await res.json()) as {
        lighthouseResult?: { categories?: Record<string, { score?: number }>; audits?: Record<string, { numericValue?: number }> };
      };
      const cat = data?.lighthouseResult?.categories ?? {};
      const audits = data?.lighthouseResult?.audits ?? {};
      const pctOf = (s?: number) => (s != null ? Math.round(s * 100) : null);
      return {
        scores: {
          performance: pctOf(cat.performance?.score),
          seo: pctOf(cat.seo?.score),
          accessibility: pctOf(cat.accessibility?.score),
          bestPractices: pctOf(cat['best-practices']?.score),
        },
        lcp: audits['largest-contentful-paint']?.numericValue
          ? audits['largest-contentful-paint']!.numericValue! / 1000
          : null,
        cls: audits['cumulative-layout-shift']?.numericValue ?? null,
        fcp: audits['first-contentful-paint']?.numericValue
          ? audits['first-contentful-paint']!.numericValue! / 1000
          : null,
      };
    } catch (err) {
      clearTimeout(to);
      return { err: `PSI ${strategy}: ${(err as Error).message}` };
    }
  }

  // Run both; retry mobile once when it succeeds but couldn't settle on LCP
  // (cold-start CDN + slow-4G emulation). Desktop is reliable, no retry.
  let [m, d] = await Promise.all([one('mobile'), one('desktop')]);
  if ('scores' in m && m.lcp == null && m.scores.performance == null) {
    const m2 = await one('mobile');
    if ('scores' in m2 && m2.lcp != null) m = m2;
  }
  const errs = [m, d].map((r) => ('err' in r ? r.err : null)).filter(Boolean) as string[];

  const mobile = 'scores' in m ? m.scores : null;
  const desktop = 'scores' in d ? d.scores : null;
  const fromMobile = 'scores' in m ? m : null;

  let partial: string | undefined;
  if (fromMobile && fromMobile.lcp == null && fromMobile.scores.performance == null) {
    partial =
      'mobile: PSI completed but Lighthouse could not measure LCP (common on cold-start CDN + slow-4G emulation). Other mobile scores and FCP are valid.';
  }

  return {
    mobile,
    desktop,
    lcp: fromMobile?.lcp ?? null,
    cls: fromMobile?.cls ?? null,
    fcp: fromMobile?.fcp ?? null,
    ...(errs.length ? { error: errs.join('; ') } : {}),
    ...(partial ? { partial } : {}),
  };
}

// ---------- Google Places (GBP) ----------

const EMPTY_GBP = (error: string): GbpAudit => ({
  rating: null,
  reviewCount: null,
  responseRate: null,
  photoCount: null,
  hoursComplete: null,
  category: null,
  website: null,
  phone: null,
  address: null,
  lastReviewAt: null,
  error,
});

export async function auditGbp(placeId: string, apiKey?: string): Promise<GbpAudit> {
  if (!placeId) return EMPTY_GBP('No placeId');
  if (!apiKey) return EMPTY_GBP('No Places API key');

  const fields =
    'name,rating,userRatingCount,reviews,photos,regularOpeningHours,types,websiteUri,nationalPhoneNumber,formattedAddress,primaryTypeDisplayName';
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`;
  try {
    const res = await fetch(url, {
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fields },
    });
    if (!res.ok) return EMPTY_GBP(`Places ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      rating?: number;
      userRatingCount?: number;
      reviews?: Array<{ authorAttribution?: unknown; reply?: unknown; publishTime?: string }>;
      photos?: unknown[];
      regularOpeningHours?: { periods?: unknown[] };
      types?: string[];
      websiteUri?: string;
      nationalPhoneNumber?: string;
      formattedAddress?: string;
      primaryTypeDisplayName?: { text?: string };
    };
    const reviews = Array.isArray(data.reviews) ? data.reviews : [];
    const withResponse = reviews.filter((r) => r.authorAttribution && r.reply).length;
    const lastReview =
      reviews
        .map((r) => r.publishTime)
        .filter((t): t is string => Boolean(t))
        .sort()
        .reverse()[0] ?? null;

    return {
      rating: data.rating ?? null,
      reviewCount: data.userRatingCount ?? null,
      responseRate: reviews.length ? withResponse / reviews.length : null,
      photoCount: Array.isArray(data.photos) ? data.photos.length : null,
      hoursComplete: Array.isArray(data.regularOpeningHours?.periods)
        ? data.regularOpeningHours!.periods!.length >= 5
        : null,
      category:
        data.primaryTypeDisplayName?.text ??
        (Array.isArray(data.types) ? data.types[0] : null) ??
        null,
      website: data.websiteUri ?? null,
      phone: data.nationalPhoneNumber ?? null,
      address: data.formattedAddress ?? null,
      lastReviewAt: lastReview,
    };
  } catch (err) {
    return EMPTY_GBP((err as Error).message);
  }
}

// ---------- Sitemap page sampling ----------

async function listSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const all = new Set<string>();
  const queue = [sitemapUrl];
  const visited = new Set<string>();
  while (queue.length && all.size < 500) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    visited.add(next);
    try {
      const res = await fetch(next, { headers: { 'User-Agent': RANK_UA } });
      if (!res.ok) continue;
      const xml = await res.text();
      const childSitemaps = Array.from(xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>/gi)).map(
        (m) => (m[1] ?? '').trim(),
      );
      for (const c of childSitemaps) if (visited.size < 10) queue.push(c);
      const urls = Array.from(xml.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>/gi)).map((m) =>
        (m[1] ?? '').trim(),
      );
      for (const u of urls) all.add(u);
    } catch {
      /* skip */
    }
  }
  return Array.from(all);
}

function rankSitemapUrls(urls: string[], cfg: ScannerConfig): string[] {
  const highValue = cfg.highValuePatterns.map((s) => new RegExp(s, 'i'));
  const skip = cfg.skipPatterns.map((s) => new RegExp(s, 'i'));
  const scored = urls
    .filter((u) => !skip.some((re) => re.test(u)))
    .map((u) => {
      let score = 0;
      for (const re of highValue) if (re.test(u)) score += 2;
      try {
        const depth = (new URL(u).pathname.match(/\//g) ?? []).length;
        if (depth >= 2 && depth <= 4) score += 1;
      } catch {
        /* ignore unparseable URL */
      }
      return { u, score };
    })
    .filter((r) => r.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.map((r) => r.u);
}

async function fetchPageExcerpt(url: string, fetcher: Fetcher): Promise<SampledPage | null> {
  const fetched = await fetcher.fetchHtml(url);
  if (!fetched.html) return null;
  const html = fetched.html;
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i, html);
  const h1 = Array.from(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
    .map((m) => stripTags(m[1] ?? ''))
    .filter(Boolean)
    .slice(0, 3);
  const h2 = Array.from(html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi))
    .map((m) => stripTags(m[1] ?? ''))
    .filter(Boolean)
    .slice(0, 12);
  const main = html
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ');
  const words = stripTags(main).split(/\s+/).filter(Boolean);
  const excerpt = words.slice(0, 500).join(' ');
  const schemaTypes = extractSchema(html).types;
  const h2Count = (html.match(/<h2\b/gi) ?? []).length;
  const linkOrigin = originOf(url);
  const links = Array.from(html.matchAll(/<a\b[^>]*\shref=["']([^"']+)["']/gi)).map((m) => m[1] ?? '');
  let internalLinks = 0;
  let externalLinks = 0;
  for (const href of links) {
    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:')
    )
      continue;
    if (href.startsWith('/') || (linkOrigin && href.startsWith(linkOrigin))) internalLinks++;
    else if (/^https?:\/\//i.test(href)) externalLinks++;
  }
  return { url, title, h1, h2, excerpt, schemaTypes, wordCount: words.length, h2Count, internalLinks, externalLinks };
}

export async function samplePages(
  sitemapUrl: string | null,
  opts: { fetcher: Fetcher; cfg: ScannerConfig; limit?: number; targetOrigin?: string },
): Promise<SampledPage[]> {
  if (!sitemapUrl) return [];
  const all = await listSitemapUrls(sitemapUrl);
  let urls = rankSitemapUrls(all, opts.cfg);
  // Rewrite each URL's origin to the deployment being audited (sitemaps bake
  // build-time hosts that may point at production even on a preview).
  if (opts.targetOrigin) {
    const target = opts.targetOrigin;
    urls = urls.map((u) => {
      try {
        return new URL(new URL(u).pathname, target).toString();
      } catch {
        return u;
      }
    });
  }
  const ranked = urls.slice(0, opts.limit ?? 8);
  const samples = await Promise.all(ranked.map((u) => fetchPageExcerpt(u, opts.fetcher)));
  return samples.filter((s): s is SampledPage => s !== null);
}

// ---------- Aggregate page stats + template detection ----------

export function computePageStats(pages: SampledPage[], thinPageWordFloor = 300): PageStats | null {
  if (!pages.length) return null;
  const words = pages.map((p) => p.wordCount ?? 0).sort((a, b) => a - b);
  const sum = words.reduce((a, b) => a + b, 0);
  const avg = sum / words.length;
  const median =
    words.length % 2 === 1
      ? words[(words.length - 1) >> 1]!
      : (words[words.length / 2 - 1]! + words[words.length / 2]!) / 2;
  const h2s = pages.map((p) => p.h2Count ?? 0);
  const internals = pages.map((p) => p.internalLinks ?? 0);
  const schemaUnion = new Set<string>();
  for (const p of pages) for (const t of p.schemaTypes ?? []) schemaUnion.add(t);
  return {
    count: pages.length,
    avgWordCount: Math.round(avg),
    medianWordCount: Math.round(median),
    minWordCount: words[0]!,
    maxWordCount: words[words.length - 1]!,
    thinPageCount: pages.filter((p) => (p.wordCount ?? 0) < thinPageWordFloor).length,
    avgH2Count: Math.round((h2s.reduce((a, b) => a + b, 0) / h2s.length) * 10) / 10,
    avgInternalLinks: Math.round((internals.reduce((a, b) => a + b, 0) / internals.length) * 10) / 10,
    sitewideSchemaTypes: Array.from(schemaUnion).sort(),
  };
}

/**
 * Identify a vendor template from the homepage HTML + sampled page stats. The
 * named vendor fingerprints come from config (`cfg.templateVendors`); the
 * `generic-template` heuristic (polished homepage + thin/repetitive service
 * pages) is the built-in structural tell. When detected, the host should cap
 * threat ceilings and steer gap-report strategy toward depth/originality.
 */
export function detectTemplateVendor(
  homepageHtml: string,
  pages: SampledPage[],
  homepage: HomepageAudit | null,
  cfg: ScannerConfig = defaultScannerConfig,
): TemplateVendor {
  const html = homepageHtml ?? '';
  for (const vendor of cfg.templateVendors) {
    for (const fp of vendor.fingerprints) {
      try {
        if (new RegExp(fp, 'i').test(html)) return vendor.name;
      } catch {
        /* skip a malformed fingerprint rather than throw mid-audit */
      }
    }
  }
  const stats = computePageStats(pages, cfg.thinPageWordFloor);
  if (stats && homepage && pages.length >= cfg.genericMinSampledPages) {
    const homepageWords = homepage.wordCount ?? 0;
    const cliffRatio = stats.avgWordCount > 0 ? homepageWords / stats.avgWordCount : 0;
    const thinRatio = stats.thinPageCount / pages.length;
    if (cliffRatio >= cfg.genericHomepageWordRatio && thinRatio >= cfg.genericThinPageFraction)
      return 'generic-template';
  }
  return null;
}

// ---------- Full audit ----------

export interface RunAuditOptions {
  url: string;
  placeId?: string;
  pageSpeedKey?: string;
  placesKey?: string;
  skipPageSpeed?: boolean;
  skipPageSampling?: boolean;
  pageSampleLimit?: number;
  /** GEO scoring config (e.g. `pack.scoring.geo`). Defaults to the health pack. */
  geo?: GeoConfig;
  /** Scanner tuning (`resolveScannerConfig(pack.competitors)`). */
  scannerConfig?: ScannerConfig;
  /** Network boundary. Defaults to `defaultFetcher()` (global fetch). */
  fetcher?: Fetcher;
}

/**
 * Audit one target site end-to-end. The signature collapses BoH's
 * `runAudit(opts)` — same orchestration, with `keys` and tuning carried in
 * `opts`. The `(target, keys)` calling convention the catalog names is
 * `runAudit({ url: target, ...keys })`.
 */
export async function runAudit(opts: RunAuditOptions): Promise<CompetitorAudit> {
  const fetcher = opts.fetcher ?? defaultFetcher();
  const cfg = opts.scannerConfig ?? defaultScannerConfig;
  const errors: string[] = [];

  const homepageRes = await auditHomepage(opts.url, { fetcher, geo: opts.geo });
  let homepage: HomepageAudit | null = null;
  let html = '';
  if ('error' in homepageRes) {
    errors.push(`homepage: ${homepageRes.error}`);
  } else {
    homepage = homepageRes;
    // Re-fetch the homepage HTML for schema/positioning. The fetcher owns the
    // proxy circuit-breaker, so a second call after a proxy failure is cheap.
    try {
      const r = await fetcher.fetchHtml(homepage.finalUrl);
      if (r.html) html = r.html;
    } catch {
      /* ignore second fetch failure for schema */
    }
  }

  const targetUrl = homepage?.finalUrl ?? opts.url;

  const [sitemap, robots, pageSpeed, gbp] = await Promise.all([
    auditSitemap(targetUrl).catch((e) => {
      errors.push(`sitemap: ${(e as Error).message}`);
      return null;
    }),
    auditRobots(targetUrl).catch((e) => {
      errors.push(`robots: ${(e as Error).message}`);
      return null;
    }),
    opts.skipPageSpeed
      ? Promise.resolve(null)
      : auditPageSpeed(targetUrl, opts.pageSpeedKey).catch((e) => {
          errors.push(`pagespeed: ${(e as Error).message}`);
          return null;
        }),
    opts.placeId
      ? auditGbp(opts.placeId, opts.placesKey).catch((e) => {
          errors.push(`gbp: ${(e as Error).message}`);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const homepageSchema = html ? extractSchema(html) : null;

  let homepageText: string | null = null;
  if (html) {
    const main = html
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<aside[\s\S]*?<\/aside>/gi, ' ');
    homepageText = stripTags(main).split(/\s+/).slice(0, 1500).join(' ');
  }

  const deploymentOrigin = homepage?.finalUrl ? originOf(homepage.finalUrl) : undefined;
  const pages =
    opts.skipPageSampling || !sitemap?.found
      ? []
      : await samplePages(sitemap.url, {
          fetcher,
          cfg,
          limit: opts.pageSampleLimit ?? 8,
          targetOrigin: deploymentOrigin,
        }).catch((e) => {
          errors.push(`pages: ${(e as Error).message}`);
          return [] as SampledPage[];
        });

  // Aggregate schema across homepage + sampled pages; union the per-type field
  // maps so the gap report can tell "type exists and is fully populated" from
  // "type exists but is bare-bones".
  const allTypes = new Set<string>(homepageSchema?.types ?? []);
  const allFields: Record<string, Set<string>> = {};
  if (homepageSchema?.fieldsByType) {
    for (const [t, fields] of Object.entries(homepageSchema.fieldsByType)) {
      const set = (allFields[t] ??= new Set());
      for (const f of fields) set.add(f);
    }
  }
  for (const p of pages) for (const t of p.schemaTypes) allTypes.add(t);
  const fieldsByType: Record<string, string[]> = {};
  for (const [t, set] of Object.entries(allFields)) fieldsByType[t] = Array.from(set).sort();
  const schemaOrg: SchemaAudit | null = homepageSchema
    ? { ...homepageSchema, types: Array.from(allTypes).sort(), fieldsByType }
    : allTypes.size
      ? { types: Array.from(allTypes).sort(), raw: [], count: 0, fieldsByType }
      : null;

  const pageStats = computePageStats(pages, cfg.thinPageWordFloor);
  const templateVendor = detectTemplateVendor(html, pages, homepage, cfg);

  return {
    fetchedAt: new Date().toISOString(),
    homepage,
    homepageText,
    schemaOrg,
    sitemap,
    robots,
    pageSpeed,
    gbp,
    pages,
    pageStats,
    templateVendor,
    positioning: null,
    errors,
  };
}

// ---------- Quick diff helper ----------

function pct(num: number | null | undefined, denom: number | null | undefined): number | null {
  if (num == null || denom == null || denom === 0) return null;
  return Math.round((num / denom) * 100);
}

export function compareAudits(us: CompetitorAudit | null, them: CompetitorAudit): GapSignal[] {
  const out: GapSignal[] = [];
  const num = (n: number | null | undefined, suffix = '') => (n == null ? '—' : `${n}${suffix}`);

  const cmp = (
    label: string,
    u: number | null | undefined,
    t: number | null | undefined,
    higherIsBetter = true,
    suffix = '',
  ) => {
    if (u == null && t == null) return;
    let advantage: GapSignal['advantage'] = 'tie';
    if (u != null && t != null) {
      if (u === t) advantage = 'tie';
      else if (higherIsBetter ? u > t : u < t) advantage = 'us';
      else advantage = 'them';
    } else if (u != null) advantage = 'us';
    else advantage = 'them';
    out.push({ label, us: num(u, suffix), them: num(t, suffix), advantage });
  };

  cmp('Homepage word count', us?.homepage?.wordCount, them.homepage?.wordCount);
  cmp('H2 sections', us?.homepage?.h2Count, them.homepage?.h2Count);
  cmp(
    'Images with alt %',
    pct(us?.homepage?.imagesWithAlt, us?.homepage?.imageCount),
    pct(them.homepage?.imagesWithAlt, them.homepage?.imageCount),
    true,
    '%',
  );
  cmp('Internal links', us?.homepage?.internalLinks, them.homepage?.internalLinks);
  cmp('Schema.org types', us?.schemaOrg?.types.length, them.schemaOrg?.types.length);
  cmp('Sitemap URL count', us?.sitemap?.urlCount, them.sitemap?.urlCount);

  cmp('GBP rating', us?.gbp?.rating, them.gbp?.rating);
  cmp('GBP review count', us?.gbp?.reviewCount, them.gbp?.reviewCount);
  cmp('GBP response rate %', pct(us?.gbp?.responseRate, 1), pct(them.gbp?.responseRate, 1), true, '%');
  cmp('GBP photo count', us?.gbp?.photoCount, them.gbp?.photoCount);

  cmp('PSI mobile performance', us?.pageSpeed?.mobile?.performance, them.pageSpeed?.mobile?.performance);
  cmp('PSI mobile SEO', us?.pageSpeed?.mobile?.seo, them.pageSpeed?.mobile?.seo);
  cmp('LCP (lower better)', us?.pageSpeed?.lcp, them.pageSpeed?.lcp, false, 's');
  cmp('CLS (lower better)', us?.pageSpeed?.cls, them.pageSpeed?.cls, false);

  return out;
}

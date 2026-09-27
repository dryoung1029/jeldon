import { defaultFetcher, listSitemapUrls, type Fetcher } from '@jeldon/competitive-intel';
import type { GeoConfig } from '@jeldon/config';
import { analyzePage } from './page.js';
import { runPsi } from './psi.js';
import type { PageFacts, PsiResult, SiteSnapshot } from './types.js';

export interface SnapshotOptions {
  fetcher?: Fetcher;
  fetchImpl?: typeof fetch;
  geo?: GeoConfig;
  /** Max pages to sample beyond home (sitemap order, services/blog preferred). Default 12. */
  maxPages?: number;
  /** Path prefix for the service pages on this site (to pick the PSI second page). */
  servicePrefixHints?: string[];
  articlePrefix?: string;
  psi?: boolean;
  psiKey?: string;
  /** Max internal links to HEAD-check for dead links. Default 40. */
  maxLinkChecks?: number;
  /** Extra URLs to include (e.g. a known blog index when the sitemap is missing). */
  extraUrls?: string[];
  log?: (line: string) => void;
}

const SERVICE_HINT = /\/(programs?|services?|care|treatments?|classes|conditions)\//i;
const BLOG_HINT = /\/(blog|articles?|news|posts?|journal)\//i;

/** Fetch what we need from one site: home, sampled pages, sitemap, robots, PSI. */
export async function snapshotSite(url: string, opts: SnapshotOptions = {}): Promise<SiteSnapshot> {
  const fetcher = opts.fetcher ?? defaultFetcher();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const log = opts.log ?? (() => undefined);
  const errors: string[] = [];
  const pages: PageFacts[] = [];

  log(`Snapshot ${url}`);
  const homeRes = await fetcher.fetchHtml(url);
  if (!homeRes.html) {
    return { url, origin: url, fetchedAt: new Date().toISOString(), sitemapFound: false, sitemapUrls: [], robotsFound: false, pages: [], home: null, servicePage: null, deadLinks: [], checkedLinks: 0, psi: null, contactTest: null, errors: [`homepage fetch failed: ${homeRes.error ?? homeRes.status}`] };
  }
  const origin = new URL(homeRes.finalUrl).origin;
  const home = analyzePage(homeRes.finalUrl, homeRes.html, homeRes.status, { origin, geo: opts.geo, articlePrefix: opts.articlePrefix });
  pages.push(home);

  // Sitemap + robots discovery through the injected fetch (testable, and the
  // same transport the page fetches use).
  let sitemapUrl: string | null = null;
  for (const cand of ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml']) {
    try {
      const r = await fetchImpl(`${origin}${cand}`, { redirect: 'follow' });
      if (r.ok) {
        sitemapUrl = `${origin}${cand}`;
        break;
      }
    } catch {
      /* try next */
    }
  }
  let robotsFound = false;
  try {
    robotsFound = (await fetchImpl(`${origin}/robots.txt`, { redirect: 'follow' })).ok;
  } catch {
    /* absent */
  }
  const sitemap = sitemapUrl ? { found: true, url: sitemapUrl } : null;
  const robots = { found: robotsFound };
  let sitemapUrls: string[] = [];
  if (sitemap?.found && sitemap.url) {
    try {
      sitemapUrls = (await listSitemapUrls(sitemap.url, fetchImpl)).map((u) => {
        try {
          return new URL(new URL(u).pathname, origin).toString();
        } catch {
          return u;
        }
      });
    } catch (e) {
      errors.push(`sitemap: ${(e as Error).message}`);
    }
  }
  // Prefer service + blog pages, then the rest, up to maxPages.
  const candidates = [...new Set([...sitemapUrls, ...(opts.extraUrls ?? [])])].filter((u) => new URL(u).pathname.replace(/\/$/, '') !== '');
  const hintRe = opts.servicePrefixHints?.length ? new RegExp(`(${opts.servicePrefixHints.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i') : SERVICE_HINT;
  const ranked = [
    ...candidates.filter((u) => hintRe.test(new URL(u).pathname)),
    ...candidates.filter((u) => BLOG_HINT.test(new URL(u).pathname) && !hintRe.test(new URL(u).pathname)),
    ...candidates.filter((u) => !hintRe.test(new URL(u).pathname) && !BLOG_HINT.test(new URL(u).pathname)),
  ].slice(0, opts.maxPages ?? 12);

  for (const u of ranked) {
    try {
      const r = await fetcher.fetchHtml(u);
      if (!r.html) {
        errors.push(`fetch ${u}: ${r.error ?? r.status}`);
        continue;
      }
      pages.push(analyzePage(r.finalUrl || u, r.html, r.status, { origin, geo: opts.geo, articlePrefix: opts.articlePrefix }));
    } catch (e) {
      errors.push(`fetch ${u}: ${(e as Error).message}`);
    }
  }
  log(`  ${pages.length} page(s) analyzed, ${sitemapUrls.length} in sitemap`);

  // Dead-link check on internal links from the sampled pages (HEAD, capped).
  const internal = new Set<string>();
  for (const p of pages) {
    for (const h of p.links) {
      if (!h || h.startsWith('#') || /^(mailto|tel|javascript):/i.test(h)) continue;
      try {
        const abs = new URL(h, p.url);
        if (abs.origin === origin) internal.add(abs.toString().split('#')[0]!);
      } catch {
        /* ignore */
      }
    }
  }
  const toCheck = [...internal].slice(0, opts.maxLinkChecks ?? 40);
  const deadLinks: string[] = [];
  await Promise.all(
    toCheck.map(async (l) => {
      try {
        const r = await fetchImpl(l, { method: 'HEAD', redirect: 'follow' });
        if (r.status >= 400) {
          // Some hosts reject HEAD; confirm with GET before calling it dead.
          const g = await fetchImpl(l, { method: 'GET', redirect: 'follow' });
          if (g.status >= 400) deadLinks.push(`${l} (${g.status})`);
        }
      } catch {
        deadLinks.push(`${l} (unreachable)`);
      }
    }),
  );

  const servicePage = pages.find((p) => p !== home && hintRe.test(p.path)) ?? pages.find((p) => p !== home && !p.isArticle) ?? null;

  let psi: SiteSnapshot['psi'] = null;
  if (opts.psi) {
    const targets = [home.url, servicePage?.url].filter((x): x is string => Boolean(x));
    const mobile: Record<string, PsiResult> = {};
    const desktop: Record<string, PsiResult> = {};
    for (const t of targets) {
      log(`  PageSpeed ${t}`);
      mobile[t] = await runPsi(t, 'mobile', { apiKey: opts.psiKey, fetchImpl });
      desktop[t] = await runPsi(t, 'desktop', { apiKey: opts.psiKey, fetchImpl });
    }
    psi = { mobile, desktop };
  }

  return {
    url,
    origin,
    fetchedAt: new Date().toISOString(),
    sitemapFound: Boolean(sitemap?.found),
    sitemapUrls,
    robotsFound: Boolean(robots?.found),
    pages,
    home,
    servicePage,
    deadLinks,
    checkedLinks: toCheck.length,
    psi,
    contactTest: null,
    errors,
  };
}

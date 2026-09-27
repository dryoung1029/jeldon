/**
 * Scrape the OLD site with @jeldon/competitive-intel so the interview only has
 * to CONFIRM. Everything found is written with a `SETUP:` marker until the
 * owner confirms it (the wizard confirms; it never supplies).
 */
import {
  auditHomepageWithHtml,
  auditSitemap,
  defaultFetcher,
  extractSchema,
  htmlToScorableMarkdown,
  linkHref,
  listSitemapUrls,
  metaContent,
  resolveScannerConfig,
  stripTags,
  type Fetcher,
} from '@jeldon/competitive-intel';
import { bookingVendorOf, type BookingVendor } from '@jeldon/kit-local-business';
import { LABEL_PRESETS } from '@jeldon/kit-local-business';

export interface ScrapedPost {
  url: string;
  path: string;
  title: string;
  date: string | null;
  excerpt: string;
  /** Markdown-ish body projection of the page's main content. */
  body: string;
}

export interface Scrape {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  nap: { name?: string; street?: string; city?: string; region?: string; postalCode?: string; phone?: string; email?: string };
  geo?: { latitude: number; longitude: number };
  social: Record<string, string>;
  logoUrl: string | null;
  ogImage: string | null;
  themeColor: string | null;
  navLabels: string[];
  sitemapUrls: string[];
  bookingLinks: Array<{ url: string; vendor: BookingVendor; text: string }>;
  googleSiteVerification: string | null;
  templateVendor: string | null;
  homepageGeoScore: number | null;
  posts: ScrapedPost[];
  errors: string[];
}

const SOCIAL_HOSTS: Array<[RegExp, string]> = [
  [/facebook\.com/i, 'facebook'],
  [/instagram\.com/i, 'instagram'],
  [/tiktok\.com/i, 'tiktok'],
  [/youtube\.com|youtu\.be/i, 'youtube'],
  [/linkedin\.com/i, 'linkedin'],
  [/twitter\.com|x\.com/i, 'x'],
  [/yelp\.com/i, 'yelp'],
];

function hrefs(html: string): Array<{ href: string; text: string }> {
  return Array.from(html.matchAll(/<a\b[^>]*\shref=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)).map((m) => ({
    href: m[1] ?? '',
    text: stripTags(m[2] ?? '').slice(0, 80),
  }));
}

function findPhone(text: string): string | undefined {
  const m = text.match(/(?:\+1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/);
  return m ? `+1-${m[1]}-${m[2]}-${m[3]}` : undefined;
}

function findEmail(html: string): string | undefined {
  const m = html.match(/mailto:([^"'?\s>]+)/i) ?? html.match(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i);
  return m ? (m[1] ?? m[0]) : undefined;
}

/** NAP from the first LocalBusiness/Organization JSON-LD node, if any. */
function napFromSchema(html: string): Scrape['nap'] & { geo?: Scrape['geo'] } {
  const { raw } = extractSchema(html);
  const nodes: Record<string, unknown>[] = [];
  const push = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (Array.isArray(o['@graph'])) o['@graph'].forEach(push);
    else nodes.push(o);
  };
  raw.forEach((r) => (Array.isArray(r) ? r.forEach(push) : push(r)));
  for (const n of nodes) {
    const t = String(Array.isArray(n['@type']) ? n['@type'].join(' ') : n['@type'] ?? '');
    if (!/Organization|LocalBusiness|Store|Gym|Club|Clinic|Physician/i.test(t)) continue;
    const addr = (n.address ?? {}) as Record<string, unknown>;
    const g = (n.geo ?? {}) as Record<string, unknown>;
    return {
      name: typeof n.name === 'string' ? n.name : undefined,
      street: typeof addr.streetAddress === 'string' ? addr.streetAddress : undefined,
      city: typeof addr.addressLocality === 'string' ? addr.addressLocality : undefined,
      region: typeof addr.addressRegion === 'string' ? addr.addressRegion : undefined,
      postalCode: typeof addr.postalCode === 'string' ? addr.postalCode : undefined,
      phone: typeof n.telephone === 'string' ? n.telephone : undefined,
      email: typeof n.email === 'string' ? n.email : undefined,
      geo: typeof g.latitude === 'number' && typeof g.longitude === 'number' ? { latitude: g.latitude, longitude: g.longitude } : undefined,
    };
  }
  return {};
}

const BLOG_PATH = /\/(blog|news|articles?|posts?|journal|insights?|resources)(?:[-/]|$)/i;

export interface ScrapeOptions {
  fetcher?: Fetcher;
  /** Max blog posts to fetch + migrate. Default 25. */
  maxPosts?: number;
  /** Skip fetching individual posts (fast mode). */
  skipPosts?: boolean;
  log?: (line: string) => void;
}

export async function scrapeOldSite(oldUrl: string, opts: ScrapeOptions = {}): Promise<Scrape> {
  const fetcher = opts.fetcher ?? defaultFetcher();
  const log = opts.log ?? (() => undefined);
  const errors: string[] = [];
  const cfg = resolveScannerConfig({
    roster: [],
    targetKeywords: [],
    templateVendors: [
      { name: 'PushPress', fingerprints: ['pushpress\\.com', 'Site by PushPress'] },
      { name: 'Webflow', fingerprints: ['website-files\\.com', 'data-wf-page'] },
      { name: 'Wix', fingerprints: ['wixstatic\\.com', 'wix-code'] },
      { name: 'Squarespace', fingerprints: ['squarespace\\.com', 'static1\\.squarespace'] },
      { name: 'WordPress', fingerprints: ['wp-content', 'wp-includes'] },
      { name: 'Mindbody', fingerprints: ['mindbodyonline\\.com'] },
      { name: 'Zen Planner', fingerprints: ['zenplanner\\.com'] },
      { name: 'Wodify', fingerprints: ['wodify\\.com'] },
      { name: 'GoDaddy', fingerprints: ['godaddy\\.com', 'img1\\.wsimg\\.com'] },
    ],
  });

  log(`Scraping ${oldUrl} …`);
  const home = await auditHomepageWithHtml(oldUrl, { fetcher });
  if ('error' in home) {
    return {
      url: oldUrl, finalUrl: oldUrl, title: null, description: null, nap: {}, social: {}, logoUrl: null, ogImage: null,
      themeColor: null, navLabels: [], sitemapUrls: [], bookingLinks: [], googleSiteVerification: null, templateVendor: null,
      homepageGeoScore: null, posts: [], errors: [`homepage: ${home.error}`],
    };
  }
  const html = home.html;
  const text = stripTags(html);
  const links = hrefs(html);
  const origin = new URL(home.finalUrl).origin;

  const social: Record<string, string> = {};
  for (const { href } of links) {
    for (const [re, key] of SOCIAL_HOSTS) if (re.test(href) && !social[key]) social[key] = href;
  }

  const bookingLinks: Scrape['bookingLinks'] = [];
  const seen = new Set<string>();
  for (const { href, text: t } of links) {
    const vendor = bookingVendorOf(href);
    if (vendor && !seen.has(href)) {
      seen.add(href);
      bookingLinks.push({ url: href, vendor, text: t });
    }
  }

  const navBlock = html.match(/<nav\b[\s\S]*?<\/nav>/i)?.[0] ?? html.match(/<header\b[\s\S]*?<\/header>/i)?.[0] ?? '';
  const navLabels = [...new Set(hrefs(navBlock).map((l) => l.text).filter((t) => t && t.length < 40))].slice(0, 12);

  const fromSchema = napFromSchema(html);
  const logoImg = html.match(/<img\b[^>]*\ssrc=["']([^"']*logo[^"']*)["']/i)?.[1] ?? null;
  const templateVendor = (() => {
    for (const v of cfg.templateVendors) for (const fp of v.fingerprints) if (new RegExp(fp, 'i').test(html)) return v.name;
    return null;
  })();

  let sitemapUrls: string[] = [];
  try {
    const sm = await auditSitemap(home.finalUrl);
    if (sm.found && sm.url) sitemapUrls = await listSitemapUrls(sm.url);
  } catch (e) {
    errors.push(`sitemap: ${(e as Error).message}`);
  }
  log(`  ${sitemapUrls.length} URL(s) in the sitemap; template vendor: ${templateVendor ?? 'unknown'}`);

  const posts: ScrapedPost[] = [];
  if (!opts.skipPosts) {
    const candidates = sitemapUrls.filter((u) => BLOG_PATH.test(new URL(u).pathname) && new URL(u).pathname.split('/').filter(Boolean).length >= 2).slice(0, opts.maxPosts ?? 25);
    for (const u of candidates) {
      try {
        const r = await fetcher.fetchHtml(u);
        if (!r.html) continue;
        const main = r.html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ?? r.html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? r.html;
        const body = htmlToScorableMarkdown(main);
        if (body.split(/\s+/).length < 120) continue; // not a post
        const title = metaContent(r.html, 'og:title') ?? stripTags(r.html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '') ?? '';
        const date = metaContent(r.html, 'article:published_time') ?? r.html.match(/datetime=["'](\d{4}-\d{2}-\d{2})/i)?.[1] ?? null;
        posts.push({ url: u, path: new URL(u).pathname, title: title || new URL(u).pathname.split('/').pop()!, date: date ? date.slice(0, 10) : null, excerpt: (metaContent(r.html, 'description') ?? body.slice(0, 160)).slice(0, 200), body });
        log(`  post: ${title || u}`);
      } catch (e) {
        errors.push(`post ${u}: ${(e as Error).message}`);
      }
    }
  }

  return {
    url: oldUrl,
    finalUrl: home.finalUrl,
    title: home.title,
    description: home.metaDescription,
    nap: {
      name: fromSchema.name,
      street: fromSchema.street,
      city: fromSchema.city,
      region: fromSchema.region,
      postalCode: fromSchema.postalCode,
      phone: fromSchema.phone ?? findPhone(text),
      email: fromSchema.email ?? findEmail(html),
    },
    geo: fromSchema.geo,
    social,
    logoUrl: logoImg ? new URL(logoImg, origin).toString() : null,
    ogImage: metaContent(html, 'og:image'),
    themeColor: metaContent(html, 'theme-color'),
    navLabels,
    sitemapUrls,
    bookingLinks,
    googleSiteVerification: metaContent(html, 'google-site-verification'),
    templateVendor,
    homepageGeoScore: home.geoScore,
    posts,
    errors,
  };
}

/** Guess the vertical from the homepage vocabulary — a hint the interview confirms. */
export function guessVertical(scrape: Pick<Scrape, 'title' | 'description' | 'navLabels'>): keyof typeof LABEL_PRESETS {
  const t = `${scrape.title ?? ''} ${scrape.description ?? ''} ${scrape.navLabels.join(' ')}`.toLowerCase();
  if (/gym|fitness|strength|crossfit|training|workout|coach/.test(t)) return 'gym';
  if (/clinic|chiropract|physical therap|dental|doctor|patient|medical|acupunct|massage|wellness center/.test(t)) return 'clinic';
  if (/yoga|pilates|studio|dance|barre/.test(t)) return 'studio';
  if (/shop|store|repair|bike|bicycle|retail/.test(t)) return 'shop';
  return 'generic';
}

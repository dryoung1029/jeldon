/**
 * The ten dimensions. Each `measure()` reads a SiteSnapshot and returns a
 * Measurement whose `score` is higher-is-better (lower-is-better raw metrics
 * are inverted), so `compare()` is one rule for all ten.
 */
import type { DimensionId, Measurement, PageFacts, SiteSnapshot, Verdict } from './types.js';

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const publicPages = (s: SiteSnapshot) => s.pages.filter((p) => !/noindex/i.test(p.robotsMeta ?? ''));

export interface MeasureOptions {
  /** Provided Google Business Profile record for the Local dimension. */
  gbp?: { name?: string; street?: string; phone?: string; city?: string };
  /** Was the contact form tested (NEW only)? */
  contactOk?: boolean | null;
  today?: Date;
}

export function measureSpeed(s: SiteSnapshot): Measurement {
  if (!s.psi) return { id: 'speed', score: null, value: 'not measured', details: {}, issues: [], note: 'PageSpeed not run (pass --psi / a PAGESPEED_API_KEY)' };
  const all = [...Object.values(s.psi.mobile), ...Object.values(s.psi.desktop)];
  const perfs = all.map((r) => r.performance).filter((n): n is number => n != null);
  if (!perfs.length) return { id: 'speed', score: null, value: 'unavailable', details: {}, issues: [], note: all.map((r) => r.error).filter(Boolean).join('; ') || 'PageSpeed returned no scores' };
  const avg = Math.round(perfs.reduce((a, b) => a + b, 0) / perfs.length);
  const mobileHome = Object.values(s.psi.mobile)[0];
  const issues: string[] = [];
  if ((mobileHome?.performance ?? 100) < 90) issues.push(`mobile performance ${mobileHome?.performance} on the home page (target ≥ 90)`);
  if ((mobileHome?.lcp ?? 0) > 2.5) issues.push(`LCP ${mobileHome?.lcp}s on mobile (target ≤ 2.5s)`);
  if ((mobileHome?.cls ?? 0) > 0.1) issues.push(`CLS ${mobileHome?.cls} (target ≤ 0.1)`);
  return {
    id: 'speed',
    score: avg,
    value: `${avg}/100 avg (mobile home ${mobileHome?.performance ?? '—'}, LCP ${mobileHome?.lcp ?? '—'}s)`,
    details: { avgPerformance: avg, mobileHomePerformance: mobileHome?.performance ?? null, lcp: mobileHome?.lcp ?? null, cls: mobileHome?.cls ?? null, totalBytes: mobileHome?.totalBytes ?? null },
    issues,
  };
}

export function measureSearchHygiene(s: SiteSnapshot): Measurement {
  const pages = publicPages(s);
  const checks: Array<[string, boolean]> = [];
  const titles = new Map<string, number>();
  const descs = new Map<string, number>();
  const issues: string[] = [];
  for (const p of pages) {
    const t = (p.title ?? '').trim();
    const d = (p.description ?? '').trim();
    titles.set(t, (titles.get(t) ?? 0) + 1);
    if (d) descs.set(d, (descs.get(d) ?? 0) + 1);
    const titleOk = t.length >= 10 && t.length <= 70;
    const descOk = d.length >= 70 && d.length <= 170;
    checks.push([`${p.path} title`, titleOk], [`${p.path} description`, descOk], [`${p.path} one H1`, p.h1s.length === 1], [`${p.path} canonical`, Boolean(p.canonical)], [`${p.path} lang`, Boolean(p.lang)], [`${p.path} viewport`, p.viewport]);
    if (!titleOk) issues.push(`${p.path}: title ${t.length ? `${t.length} chars` : 'missing'} (aim 40–60)`);
    if (!descOk) issues.push(`${p.path}: meta description ${d.length ? `${d.length} chars` : 'missing'} (aim 120–160)`);
    if (p.h1s.length !== 1) issues.push(`${p.path}: ${p.h1s.length} H1s (want exactly one)`);
    if (!p.canonical) issues.push(`${p.path}: no canonical`);
  }
  const dupTitles = [...titles.entries()].filter(([, n]) => n > 1).length;
  const dupDescs = [...descs.entries()].filter(([, n]) => n > 1).length;
  checks.push(['unique titles', dupTitles === 0], ['unique descriptions', dupDescs === 0], ['sitemap', s.sitemapFound], ['robots.txt', s.robotsFound]);
  if (dupTitles) issues.push(`${dupTitles} duplicated page title(s)`);
  if (dupDescs) issues.push(`${dupDescs} duplicated meta description(s)`);
  if (!s.sitemapFound) issues.push('no sitemap found');
  if (!s.robotsFound) issues.push('no robots.txt');
  const passed = checks.filter(([, ok]) => ok).length;
  return { id: 'search-hygiene', score: pct(passed, checks.length), value: `${passed}/${checks.length} checks pass across ${pages.length} pages`, details: { passed, total: checks.length, pages: pages.length, dupTitles, dupDescs }, issues };
}

/** Pairs of URLs that answer the same intent: same first segment after
 *  stripping a `-<brand>-in-<city>-<state>` style keyword suffix, or
 *  singular/plural twins. */
export function duplicateIntentGroups(urls: string[]): string[][] {
  const groups = new Map<string, Set<string>>();
  for (const u of urls) {
    let path: string;
    try {
      path = new URL(u).pathname.replace(/\/+$/, '');
    } catch {
      continue;
    }
    if (!path) continue;
    const seg = path.split('/').filter(Boolean);
    if (seg.length !== 1) continue; // only top-level pages
    const base = seg[0]!.toLowerCase()
      .replace(/-(?:[a-z0-9]+-)*in-[a-z]+(?:-[a-z]+)*$/, '') // "-helix-training-in-corvallis-or"
      .replace(/-(?:request|page|form)$/, '')
      .replace(/s$/, '');
    if (!base) continue;
    const set = groups.get(base) ?? new Set();
    set.add(path);
    groups.set(base, set);
  }
  return [...groups.values()].filter((s) => s.size > 1).map((s) => [...s]);
}

export function measureDuplicateUrls(s: SiteSnapshot): Measurement {
  const urls = s.sitemapUrls.length ? s.sitemapUrls : s.pages.map((p) => p.url);
  const groups = duplicateIntentGroups(urls);
  const issues = groups.map((g) => `same intent at two addresses: ${g.join(' , ')}`);
  return { id: 'duplicate-urls', score: Math.max(0, 100 - groups.length * 20), value: `${groups.length} duplicate-intent group(s)`, details: { groups: groups.length, urls: urls.length }, issues };
}

export function measureStructuredData(s: SiteSnapshot): Measurement {
  const pages = publicPages(s);
  const types = new Set<string>();
  for (const p of pages) for (const t of p.schemaTypes) types.add(t);
  const orgWithNap = pages.some((p) => p.schemaNap.address && p.schemaNap.telephone);
  const articles = pages.filter((p) => p.isArticle);
  const articlesWithSchema = articles.filter((p) => p.schemaTypes.includes('Article') || p.schemaTypes.includes('BlogPosting')).length;
  const faqPages = pages.filter((p) => p.hasFaqText || p.faqCount > 0);
  const faqWithSchema = faqPages.filter((p) => p.schemaTypes.includes('FAQPage')).length;
  const breadcrumbs = pages.filter((p) => p.path !== '/' && p.schemaTypes.includes('BreadcrumbList')).length;
  const nonHome = pages.filter((p) => p.path !== '/').length;
  const points = [
    ['Organization/LocalBusiness on the site', types.has('Organization') || [...types].some((t) => /LocalBusiness|Business|Gym|Club|Clinic|Store/.test(t))],
    ['NAP (address + phone) in the Organization node', orgWithNap],
    ['WebSite node', types.has('WebSite')],
    ['Article schema on articles', articles.length === 0 || articlesWithSchema === articles.length],
    ['FAQPage where FAQs render', faqPages.length === 0 || faqWithSchema === faqPages.length],
    ['BreadcrumbList on inner pages', nonHome === 0 || breadcrumbs >= Math.ceil(nonHome * 0.8)],
    ['Person node for the author/owner', types.has('Person') || [...types].some((t) => /Physician|Person/.test(t))],
  ] as Array<[string, boolean]>;
  const passed = points.filter(([, ok]) => ok).length;
  const issues = points.filter(([, ok]) => !ok).map(([l]) => `missing: ${l}`);
  return { id: 'structured-data', score: pct(passed, points.length), value: `${types.size} type(s); ${passed}/${points.length} coverage checks`, details: { types: [...types].sort().join(', '), passed, total: points.length, articlesWithSchema, articles: articles.length }, issues };
}

export function measureCitability(s: SiteSnapshot, targets: { home?: number; article?: number } = {}): Measurement {
  const home = s.home?.geoScore ?? 0;
  const articles = s.pages.filter((p) => p.isArticle);
  const artAvg = articles.length ? Math.round(articles.reduce((a, p) => a + p.geoScore, 0) / articles.length) : null;
  const issues: string[] = [];
  if (home < (targets.home ?? 50)) issues.push(`home page GEO ${home} (target ${targets.home ?? 50}+): add real statistics, a question-style H2, a first-person line, a source link`);
  if (artAvg != null && artAvg < (targets.article ?? 70)) issues.push(`articles average GEO ${artAvg} (target ${targets.article ?? 70}+)`);
  const score = artAvg == null ? home : Math.round(home * 0.5 + artAvg * 0.5);
  return { id: 'citability', score, value: `home ${home}/100${artAvg != null ? `, articles avg ${artAvg}/100 (${articles.length})` : ''}`, details: { home, articleAvg: artAvg, articles: articles.length }, issues };
}

export function measureContentDepth(s: SiteSnapshot): Measurement {
  const indexable = s.sitemapUrls.length || publicPages(s).length;
  const homeWords = s.home?.wordCount ?? 0;
  const articles = s.pages.filter((p) => p.isArticle);
  const goodPosts = articles.filter((p) => p.wordCount >= 600 && p.hasReferences).length;
  const faqs = s.pages.reduce((a, p) => Math.max(a, p.faqCount), 0);
  const issues: string[] = [];
  if (homeWords < 300) issues.push(`home page has ${homeWords} words (aim 300+ of real copy)`);
  if (articles.length && goodPosts === 0) issues.push('no article has ≥ 600 words AND a References section');
  if (!faqs) issues.push('no FAQ block found');
  const score = Math.min(100, Math.round(Math.min(indexable, 30) * 1.5 + Math.min(homeWords, 800) / 16 + goodPosts * 8 + Math.min(faqs, 10) * 2));
  return { id: 'content-depth', score, value: `${indexable} indexable pages, home ${homeWords} words, ${goodPosts} sourced post(s) ≥600w, ${faqs} FAQ(s)`, details: { indexable, homeWords, goodPosts, articles: articles.length, faqs }, issues };
}

export function measureConversionPath(s: SiteSnapshot, opts: MeasureOptions): Measurement {
  const home = s.home;
  const bookingOnHome = (home?.bookingLinks.length ?? 0) > 0;
  const ctaPageLinked = home?.links.some((h) => /free|start|book|new-patient|trial|contact|appointment/i.test(h)) ?? false;
  const clicksToBook = bookingOnHome ? 1 : ctaPageLinked ? 2 : 3;
  const dead = s.deadLinks.length;
  const hashes = s.pages.reduce((a, p) => a + p.hashLinks, 0);
  const issues: string[] = [];
  if (clicksToBook > 2) issues.push(`booking is ${clicksToBook} clicks from the home page`);
  if (!home?.ctaAboveFold) issues.push('no call-to-action link in the first section of the home page');
  if (dead) issues.push(`${dead} dead internal link(s): ${s.deadLinks.slice(0, 5).join(', ')}`);
  if (hashes) issues.push(`${hashes} placeholder "#" link(s)`);
  if (opts.contactOk === false) issues.push('the contact form test failed');
  const score = Math.max(0, 100 - (clicksToBook - 1) * 20 - (home?.ctaAboveFold ? 0 : 20) - Math.min(dead, 5) * 8 - Math.min(hashes, 5) * 4 - (opts.contactOk === false ? 20 : 0));
  return { id: 'conversion-path', score, value: `${clicksToBook} click(s) to book, CTA above fold: ${home?.ctaAboveFold ? 'yes' : 'no'}, ${dead} dead + ${hashes} "#" links${opts.contactOk == null ? '' : `, form ${opts.contactOk ? 'works' : 'FAILED'}`}`, details: { clicksToBook, ctaAboveFold: home?.ctaAboveFold ?? false, deadLinks: dead, hashLinks: hashes, checkedLinks: s.checkedLinks, contactOk: opts.contactOk ?? null }, issues };
}

export function measureAccessibility(s: SiteSnapshot): Measurement {
  const pages = publicPages(s);
  const imgs = pages.reduce((a, p) => a + p.images, 0);
  const alts = pages.reduce((a, p) => a + p.imagesWithAlt, 0);
  const inputs = pages.reduce((a, p) => a + p.inputs, 0);
  const labeled = pages.reduce((a, p) => a + p.inputsLabeled, 0);
  const oneH1 = pages.filter((p) => p.h1s.length === 1).length;
  const skip = pages.some((p) => p.skipLink);
  const focus = pages.some((p) => p.focusStyles);
  const motion = pages.some((p) => p.reducedMotion);
  const contrast = s.home?.contrast ?? null;
  const checks: Array<[string, boolean]> = [
    ['alt text on all images', imgs === 0 || alts === imgs],
    ['labels on all form fields', inputs === 0 || labeled === inputs],
    ['one H1 per page', oneH1 === pages.length],
    ['skip link', skip],
    ['visible focus styles', focus],
    ['reduced-motion respected', motion],
    ['body text contrast ≥ 4.5', contrast == null ? true : contrast >= 4.5],
  ];
  const passed = checks.filter(([, ok]) => ok).length;
  const issues = checks.filter(([, ok]) => !ok).map(([l]) => `missing: ${l}`);
  if (imgs && alts < imgs) issues.push(`${imgs - alts} image(s) without alt text`);
  return { id: 'accessibility', score: pct(passed, checks.length), value: `${passed}/${checks.length} checks; alt ${pct(alts, imgs || 1)}%${contrast != null ? `, contrast ${contrast}` : ''}`, details: { passed, total: checks.length, images: imgs, imagesWithAlt: alts, inputs, labeled, contrast }, issues };
}

export function measureHonesty(s: SiteSnapshot, opts: MeasureOptions): Measurement {
  const year = (opts.today ?? new Date()).getFullYear();
  const pages = publicPages(s);
  const unsourced = pages.reduce((a, p) => a + p.unsourcedStats, 0);
  const promos = [...new Set(pages.flatMap((p) => p.expiredPromos))];
  const staleYears = [...new Set(pages.map((p) => p.copyrightYear).filter((y): y is number => y != null && y < year))];
  const placeholders = [...new Set(pages.flatMap((p) => p.placeholderHits))];
  const issues: string[] = [];
  if (unsourced) issues.push(`${unsourced} statistic(s) stated without a source link`);
  if (promos.length) issues.push(`time-bound promotion copy still live: ${promos.join(', ')}`);
  if (staleYears.length) issues.push(`copyright year ${staleYears.join(', ')} (it is ${year})`);
  if (placeholders.length) issues.push(`placeholder text visible: ${placeholders.join(', ')}`);
  const count = unsourced + promos.length + staleYears.length + placeholders.length;
  return { id: 'honesty', score: Math.max(0, 100 - count * 12), value: `${count} issue(s)`, details: { unsourcedStats: unsourced, expiredPromos: promos.join(', '), staleCopyright: staleYears.join(', '), placeholders: placeholders.join(', ') }, issues };
}

export function measureLocal(s: SiteSnapshot, opts: MeasureOptions): Measurement {
  const home = s.home;
  const nap = s.pages.some((p) => p.schemaNap.address && p.schemaNap.telephone);
  const text = s.pages.map((p) => p.html).join('\n');
  const gbp = opts.gbp;
  const streetOk = gbp?.street ? new RegExp(gbp.street.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text) : null;
  const phoneDigits = gbp?.phone?.replace(/\D/g, '').slice(-10);
  const phoneOk = phoneDigits ? text.replace(/\D/g, '').includes(phoneDigits) : null;
  const tel = s.pages.some((p) => p.telLink);
  const map = s.pages.some((p) => p.mapPresent);
  const hours = /openingHoursSpecification|opening hours|\bhours\b/i.test(text);
  const checks: Array<[string, boolean]> = [
    ['NAP in structured data', nap],
    ['clickable phone (tel: link)', tel],
    ['map present', map],
    ['hours published', hours],
  ];
  if (streetOk != null) checks.push(['street address matches the Google Business Profile', streetOk]);
  if (phoneOk != null) checks.push(['phone matches the Google Business Profile', phoneOk]);
  const passed = checks.filter(([, ok]) => ok).length;
  const issues = checks.filter(([, ok]) => !ok).map(([l]) => `missing: ${l}`);
  return { id: 'local', score: pct(passed, checks.length), value: `${passed}/${checks.length} local signals`, details: { nap, tel, map, hours, streetMatch: streetOk, phoneMatch: phoneOk, homeBooking: home?.bookingLinks.length ?? 0 }, issues };
}

export function measureAll(s: SiteSnapshot, opts: MeasureOptions & { geoTargets?: { home?: number; article?: number } } = {}): Measurement[] {
  return [
    measureSpeed(s),
    measureSearchHygiene(s),
    measureDuplicateUrls(s),
    measureStructuredData(s),
    measureCitability(s, opts.geoTargets),
    measureContentDepth(s),
    measureConversionPath(s, opts),
    measureAccessibility(s),
    measureHonesty(s, opts),
    measureLocal(s, opts),
  ];
}

/** One rule for all ten: within `tolerance` points is a tie. */
export function compare(oldM: Measurement | null, newM: Measurement, tolerance = 2): { verdict: Verdict; why: string } {
  if (newM.score == null) return { verdict: 'unmeasured', why: newM.note ?? 'not measured on the new site' };
  if (!oldM || oldM.score == null) return { verdict: newM.issues.length ? 'tie' : 'win', why: oldM?.note ?? 'old site not measured; new site judged on its own' };
  const d = newM.score - oldM.score;
  if (d > tolerance) return { verdict: 'win', why: `${newM.score} vs ${oldM.score}` };
  if (d < -tolerance) return { verdict: 'behind', why: `${newM.score} vs ${oldM.score}` };
  return { verdict: 'tie', why: `${newM.score} vs ${oldM.score} (within ${tolerance})` };
}

export const DIMENSION_ORDER: DimensionId[] = ['speed', 'search-hygiene', 'duplicate-urls', 'structured-data', 'citability', 'content-depth', 'conversion-path', 'accessibility', 'honesty', 'local'];

export type { PageFacts };

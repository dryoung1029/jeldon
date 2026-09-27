/**
 * Per-page fact extraction — the same function runs on the old site and the
 * new site, which is what makes the comparison honest.
 */
import { extractSchema, geoScoreHtml, linkHref, metaContent, stripTags, htmlToScorableMarkdown } from '@jeldon/competitive-intel';
import type { GeoConfig } from '@jeldon/config';
import { bookingVendorOf, contrastRatio } from '@jeldon/kit-local-business';
import type { PageFacts } from './types.js';

const PLACEHOLDERS = [/\bTab [123]\b/, /\blorem ipsum\b/i, /SETUP:/, /\bTODO\b/, /\bexample\.com\b/, /\bYour Company\b/i, /\bcoming soon\b/i];
const PROMO = /\b(summer|winter|spring|fall|holiday|black friday|new year'?s?|back[- ]to[- ]school)\s+(special|sale|deal|offer|promo(tion)?)\b|\blimited[- ]time\b|\bends (soon|this week|friday)\b/gi;
const CTA_WORDS = /\b(book|start|join|sign ?up|schedule|try|get started|free|call|contact|new patient|appointment)\b/i;

export interface PageOptions {
  geo?: GeoConfig;
  origin: string;
  /** Path prefix under which articles live (for isArticle). Default: any of blog|articles|news|posts. */
  articlePrefix?: string;
}

export function analyzePage(url: string, html: string, status: number, opts: PageOptions): PageFacts {
  const path = new URL(url).pathname.replace(/\/+$/, '') || '/';
  const text = stripTags(html);
  const body = htmlToScorableMarkdown(html);
  const words = body.split(/\s+/).filter(Boolean);
  const imgs = Array.from(html.matchAll(/<img\b[^>]*>/gi)).map((m) => m[0]);
  const imagesWithAlt = imgs.filter((t) => /\salt=["'][^"']+["']/i.test(t)).length;
  const inputs = Array.from(html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)).map((m) => m[0]).filter((t) => !/type=["'](hidden|submit|button)["']/i.test(t));
  const labelIds = new Set(Array.from(html.matchAll(/<label\b[^>]*\sfor=["']([^"']+)["']/gi)).map((m) => m[1]));
  const inputsLabeled = inputs.filter((t) => {
    const id = t.match(/\sid=["']([^"']+)["']/i)?.[1];
    return (id && labelIds.has(id)) || /aria-label=|aria-labelledby=/i.test(t);
  }).length;
  const links = Array.from(html.matchAll(/<a\b[^>]*\shref=["']([^"']*)["']/gi)).map((m) => m[1] ?? '');
  const hashLinks = links.filter((h) => h === '#' || h === '' || h.startsWith('javascript:')).length;
  const { types, raw } = extractSchema(html);
  let napAddress = false;
  let napTel = false;
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (Array.isArray(o['@graph'])) o['@graph'].forEach(walk);
    const t = String(Array.isArray(o['@type']) ? o['@type'].join(' ') : o['@type'] ?? '');
    if (/Organization|LocalBusiness|Store|Gym|Club|Clinic|Business/i.test(t)) {
      if (o.address && typeof o.address === 'object' && (o.address as Record<string, unknown>).streetAddress) napAddress = true;
      if (typeof o.telephone === 'string' && o.telephone) napTel = true;
    }
  };
  raw.forEach((r) => (Array.isArray(r) ? r.forEach(walk) : walk(r)));
  const css = Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)).map((m) => m[1]).join('\n');
  const fg = css.match(/--fg:\s*(#[0-9a-f]{6})/i)?.[1];
  const bg = css.match(/--bg:\s*(#[0-9a-f]{6})/i)?.[1];
  const bodyColor = css.match(/body\s*\{[^}]*?color:\s*(#[0-9a-f]{6})/i)?.[1];
  const bodyBg = css.match(/body\s*\{[^}]*?background(?:-color)?:\s*(#[0-9a-f]{6})/i)?.[1];
  const contrast = fg && bg ? contrastRatio(fg, bg) : bodyColor && bodyBg ? contrastRatio(bodyColor, bodyBg) : null;
  const copyright = text.match(/(?:©|&copy;|\(c\)|copyright)\s*(\d{4})/i)?.[1];
  const placeholderHits = PLACEHOLDERS.filter((re) => re.test(text)).map((re) => re.source);
  // Unsourced statistics: sentences with a percentage and no link anywhere in that sentence.
  const sentences = body.split(/(?<=[.!?])\s+/);
  const unsourcedStats = sentences.filter((s) => /\d+(?:\.\d+)?\s*%/.test(s) && !/\]\(https?:\/\//.test(s) && !/according to|source|study|survey|report/i.test(s)).length;
  const faqCount = (() => {
    let n = 0;
    const walkFaq = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const o = node as Record<string, unknown>;
      if (Array.isArray(o['@graph'])) o['@graph'].forEach(walkFaq);
      if (String(o['@type']) === 'FAQPage' && Array.isArray(o.mainEntity)) n += o.mainEntity.length;
    };
    raw.forEach((r) => (Array.isArray(r) ? r.forEach(walkFaq) : walkFaq(r)));
    return n || (html.match(/<details\b/gi) ?? []).length;
  })();
  const firstSection = html.slice(0, Math.min(html.length, 20_000)).match(/<main\b[\s\S]*?(?:<\/section>|<\/header>)/i)?.[0] ?? html.slice(0, 20_000);
  const ctaAboveFold = Array.from(firstSection.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)).some((m) => CTA_WORDS.test(stripTags(m[1] ?? '')));
  const bookingLinks = [...new Set(links.filter((h) => bookingVendorOf(h)))];
  const articleRe = opts.articlePrefix ? new RegExp(`^${opts.articlePrefix.replace(/\/$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^/]+$`) : /^\/(blog|articles?|news|posts?|journal)\/[^/]+$/i;
  const isArticle = articleRe.test(path) || types.includes('Article') || types.includes('BlogPosting');

  return {
    url,
    path,
    status,
    bytes: html.length,
    title: metaContent(html, 'og:title') && !html.match(/<title[^>]*>/i) ? metaContent(html, 'og:title') : (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim() || null,
    description: metaContent(html, 'description'),
    h1s: Array.from(html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)).map((m) => stripTags(m[1] ?? '')).filter(Boolean),
    canonical: linkHref(html, 'canonical'),
    lang: html.match(/<html\b[^>]*\slang=["']([^"']+)["']/i)?.[1] ?? null,
    viewport: Boolean(metaContent(html, 'viewport')),
    robotsMeta: metaContent(html, 'robots'),
    schemaTypes: types,
    schemaNap: { address: napAddress, telephone: napTel },
    hasFaqText: /\b(faq|frequently asked|common questions|questions we get)\b/i.test(text),
    images: imgs.length,
    imagesWithAlt,
    inputs: inputs.length,
    inputsLabeled,
    skipLink: /skip[- ]?(to|link)|skip to (main|content)/i.test(html),
    focusStyles: /:focus-visible|:focus\b/.test(css),
    reducedMotion: /prefers-reduced-motion/.test(css),
    contrast,
    wordCount: words.length,
    links,
    hashLinks,
    telLink: links.some((h) => h.startsWith('tel:')),
    mapPresent: /google\.com\/maps|maps\.app\.goo\.gl|maps\.google|openstreetmap|<iframe[^>]+maps/i.test(html),
    copyrightYear: copyright ? Number(copyright) : null,
    placeholderHits,
    unsourcedStats,
    expiredPromos: [...new Set(Array.from(text.matchAll(PROMO)).map((m) => m[0]))],
    hasReferences: /^##\s+(references|sources|citations|bibliography|further reading)/im.test(body) || /<h[23][^>]*>\s*(references|sources|citations)\s*<\/h[23]>/i.test(html),
    faqCount,
    geoScore: geoScoreHtml(html, opts.geo).score,
    ctaAboveFold,
    bookingLinks,
    isArticle,
    html,
  };
}

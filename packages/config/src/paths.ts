/**
 * URL-layout helpers. The engine used to hardcode `/articles/` (article
 * canonical + sitemap exclusions) and `/team/` (author fallback URL); Helix
 * publishes at `/blog/` and had to string-rebase the emitted JSON-LD. Both
 * prefixes are now Domain Pack values — `content.articlePathPrefix` and
 * `authors[].urlPrefix` — and every package that builds an article or author
 * URL goes through these helpers so there is exactly one place the layout is
 * decided. Pure: safe in Workers and the browser.
 */
import type { DomainPack } from './types.js';

export const DEFAULT_ARTICLE_PATH_PREFIX = '/articles/';
export const DEFAULT_AUTHOR_URL_PREFIX = '/team/';

/** Normalize a prefix to the `/segment/` shape (leading + trailing slash). */
export function normalizePrefix(prefix: string): string {
  let p = prefix.trim();
  if (!p.startsWith('/')) p = `/${p}`;
  if (!p.endsWith('/')) p = `${p}/`;
  return p;
}

type PackLike = { content?: { articlePathPrefix?: string } };

/** The article URL prefix for a pack, e.g. `/articles/` or `/blog/`. */
export function articlePathPrefix(pack?: PackLike | null): string {
  return normalizePrefix(pack?.content?.articlePathPrefix ?? DEFAULT_ARTICLE_PATH_PREFIX);
}

/** Site-relative article path, e.g. `/blog/<slug>/`. */
export function articlePath(pack: PackLike | null | undefined, slug: string): string {
  return `${articlePathPrefix(pack)}${slug.replace(/^\/+|\/+$/g, '')}/`;
}

/** A regex source matching an article-detail path with the slug as group 1,
 *  derived from the prefix (used by strategy + analytics `articlePathPattern`
 *  defaults). e.g. `^/blog/([a-z0-9-]+)/?$`. */
export function articlePathPattern(pack?: PackLike | null): string {
  const prefix = articlePathPrefix(pack).replace(/\/$/, '');
  return `^${escapeRegex(prefix)}/([a-z0-9-]+)/?$`;
}

/** The bare first segment of the article prefix (`blog` for `/blog/`) — the
 *  shape `scoring.seo.internalLinkPrefixes` uses. */
export function articlePathSegment(pack?: PackLike | null): string {
  return articlePathPrefix(pack).replace(/^\/|\/$/g, '');
}

type AuthorLike = { urlPrefix?: string };

/** The URL prefix under which an author's page lives, e.g. `/team/` or `/coaches/`. */
export function authorUrlPrefix(author?: AuthorLike | null, pack?: Pick<DomainPack, 'authors'> | null): string {
  const fromAuthor = author?.urlPrefix;
  const fromPrimary = pack?.authors?.find((a) => a.isPrimary)?.urlPrefix ?? pack?.authors?.[0]?.urlPrefix;
  return normalizePrefix(fromAuthor ?? fromPrimary ?? DEFAULT_AUTHOR_URL_PREFIX);
}

/** Site-relative author path, e.g. `/coaches/kathy-lynch`. No trailing slash
 *  (kept as the historical shape; hosts with `trailingSlash: 'always'` add it). */
export function authorPath(author: AuthorLike | null | undefined, slug: string, pack?: Pick<DomainPack, 'authors'> | null): string {
  return `${authorUrlPrefix(author, pack)}${slug.replace(/^\/+|\/+$/g, '')}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

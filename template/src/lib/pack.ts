/**
 * The Domain Pack, loaded once at build time and shared across the app.
 *
 * Every page reads its domain values (brand, authors, schema policy, scoring,
 * categories, the article URL prefix) from here — never a literal. This is the
 * host-side mirror of the one rule: you specialize the engine by editing
 * `jeldon.config.ts`, nothing else.
 *
 * NOTE: this module imports the LOADER entry (`@jeldon/config/load`, jiti +
 * node:fs). Import it from build-time code only (pages, layouts, content
 * config). A server route (`export const prerender = false`) must not import
 * it — import the root `@jeldon/config` there, or a plain-data config.
 */
import { articlePath as enginePath, articlePathPrefix, type DomainPack } from '@jeldon/config';
import { loadDomainPack } from '@jeldon/config/load';

export const pack: DomainPack = await loadDomainPack();

/** `/articles/` (or whatever `content.articlePathPrefix` says). */
export const ARTICLE_PREFIX = articlePathPrefix(pack);

/** Site-relative article path for a slug, e.g. `/articles/hello/`. */
export function articlePath(slug: string): string {
  return enginePath(pack, slug);
}

/** Human-readable label for a category key. Title-cases the key unless the
 *  pack one day carries explicit labels. Kept here so pages don't re-derive it. */
export function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/** The author entry shape the schema-graph builders consume (`AuthorEntry`). */
export const authorEntries = pack.authors.map((a) => ({
  slug: a.slug,
  name: a.name,
  schemaId: a.schemaId,
}));

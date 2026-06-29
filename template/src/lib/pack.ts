/**
 * The Domain Pack, loaded once and shared across the app.
 *
 * Every page reads its domain values (brand, authors, schema policy, scoring,
 * categories) from here — never a literal. This is the host-side mirror of the
 * one rule: you specialize the engine by editing `jeldon.config.ts`, nothing
 * else. The loader is jiti-based, so no separate build step is needed to read
 * the TS config at build time.
 */
import { loadDomainPack, type DomainPack } from '@jeldon/config';

export const pack: DomainPack = await loadDomainPack();

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

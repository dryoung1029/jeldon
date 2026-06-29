/** A schema.org node ready for `JSON.stringify` into a
 *  `<script type="application/ld+json">` tag. Loose by construction — the
 *  graph builders compose plain objects, exactly as the BoH pages did. */
export type JsonLd = Record<string, unknown>;

export type Crumb = { name: string; url: string };

export type Faq = { q: string; a: string };

/** The minimal article shape `articleGraph` reads. Mirrors the BoH article
 *  frontmatter the page literal consumed (`src/pages/articles/[...slug].astro`),
 *  with no Astro/content-collection coupling. */
export interface ArticleInput {
  title: string;
  slug: string;
  excerpt: string;
  /** ISO 8601 or anything `new Date()` parses. */
  publishDate: string | Date;
  updatedDate?: string | Date;
  /** Article category key (one of `pack.content.categories`). */
  category: string;
  /** Human-readable section label for the category, e.g. "Evidence". */
  categoryLabel?: string;
  author: string;
  authorSlug: string;
  tags: string[];
  heroImage?: string;
  heroImageAlt?: string;
  /** URL of the source podcast episode, if any (drives `isBasedOn`). */
  sourceEpisode?: string;
}

/** An author entry as held in `pack.authors`. Re-declared structurally so the
 *  builders don't depend on the full DomainPack author tuple. */
export interface AuthorEntry {
  slug: string;
  name: string;
  schemaId: string;
}

/**
 * I/O boundary for `emitLlmsTxt`. The engine never touches `fs` directly —
 * a host supplies a writer. `NullWriter` (no-op) is the default; `fsWriter`
 * is the Node convenience. Matches the DECOUPLING-NOTES rule: I/O behind an
 * interface with a null/fs default.
 */
export interface Writer {
  write(path: string, contents: string): void | Promise<void>;
}

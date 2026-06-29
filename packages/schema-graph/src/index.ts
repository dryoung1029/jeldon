/**
 * @jeldon/schema-graph — domain-agnostic schema.org graph builders.
 *
 * Extracts BoH `src/lib/schema.ts` + the inline JSON-LD literals in
 * `BaseLayout.astro` / `team/jason-young.astro` / `articles/[...slug].astro`,
 * plus the `astro.config.mjs` sitemap filter and the `public/llms.txt` file.
 * Every entity shape moves from a page literal into the Domain Pack
 * (`pack.schema.org` / `pack.authors[].profile` / `pack.schema.articleGraph`);
 * generic schema.org types by default, vertical types from
 * `pack.schema.articleTypes` / `pack.schema.orgType`.
 */

export { organizationGraph, websiteGraph } from './organization.js';
export type { OrgGraphInput } from './organization.js';

export { personGraph } from './person.js';
export type { PersonGraphInput } from './person.js';

export { articleGraph } from './article.js';
export type { ArticleGraphOptions } from './article.js';

export { breadcrumbList } from './breadcrumb.js';

export { extractFaqs, faqPage } from './faqs.js';

export { emitLlmsTxt, renderLlmsTxt, NullWriter, fsWriter } from './llms-txt.js';
export type { EmitLlmsTxtResult } from './llms-txt.js';

export { sitemapExcludedArticleUrls, sitemapFilter } from './sitemap.js';
export type { ArticleStub } from './sitemap.js';

export { absUrl, orgId, websiteId } from './url.js';

export type { JsonLd, Crumb, Faq, ArticleInput, AuthorEntry, Writer } from './types.js';

/**
 * @jeldon/content-model — the portable article content model.
 *
 * Extracts BoH `frontmatter.ts`, `articles.ts`, `content/config.ts`, and
 * `publish-scheduled.mjs`. Consolidates the triple-implemented frontmatter
 * parser into one codec; derives the category enum from the Domain Pack; ships
 * the draft→docReviewed→ready→scheduled→live lifecycle machine and the
 * scheduled-publish cron logic behind a pluggable I/O interface.
 */

// Frontmatter codec (the ONE parser)
export {
  parse,
  serialize,
  parseValue,
  type Frontmatter,
  type FrontmatterValue,
  type ParsedDoc,
} from './frontmatter.js';

// Lifecycle state machine
export {
  articleStatus,
  isLive,
  isStub,
  isAutoPublishCandidate,
  selectPublished,
  selectStubs,
  type LifecycleStatus,
  type LifecycleFlags,
  type LifecycleOptions,
} from './lifecycle.js';

// Pack-derived Zod schema
export {
  buildArticleSchema,
  type ArticleSchema,
  type ArticleData,
  type BuildArticleSchemaOptions,
} from './schema.js';

// Validation
export { validateArticle, type ValidateArticleResult } from './validate.js';

// Scheduled publishing
export {
  publishScheduled,
  publishScheduledFromSource,
  todayInZone,
  MemoryArticleSource,
  type ArticleDoc,
  type PublishedArticle,
  type PublishResult,
  type ArticleSource,
} from './publish.js';

// Filesystem I/O adapter (Node-only)
export { FsArticleSource } from './fs-source.js';

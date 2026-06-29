/**
 * Article content collection schema — DERIVED from the Domain Pack.
 *
 * The single field BoH hardcoded in five places (the `category` enum) is built
 * here from `pack.content.categories` via `@jeldon/content-model`'s
 * `buildArticleSchema`. Add a category in `jeldon.config.ts` and it flows to the
 * schema, the scorer, the CI gates, and the prompts — one list, no mirrors.
 *
 * `buildArticleSchema` returns a Zod object built with the SAME `zod` the Astro
 * content layer uses, so it drops straight into `defineCollection`.
 */
import { defineCollection } from 'astro:content';
import { buildArticleSchema } from '@jeldon/content-model';
import { pack } from '../lib/pack';

const articles = defineCollection({
  type: 'content',
  schema: buildArticleSchema(pack),
});

export const collections = { articles };

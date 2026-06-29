/**
 * Tool definitions handed to the model. Ported from BoH `author.ts`
 * (TOOLS_SINGLE / TOOLS_OUTLINE / TOOLS_SERIES_DRAFT) and `chat.ts` (TOOLS:
 * verify_citation / update_article / update_articles).
 *
 * The category enum on `propose_series` is the one place a tool schema needs a
 * domain value — it's read from `pack.content.categories`, not hardcoded.
 */

import type { DraftingPack, ToolDef } from './types.js';

export const TOOLS_SINGLE: ToolDef[] = [
  {
    name: 'create_draft',
    description: 'Commit the brainstormed article as a new draft.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'URL-safe slug. Max 80 chars.' },
        content: { type: 'string', description: 'Complete article markdown including frontmatter.' },
        summary: { type: 'string', description: 'One past-tense sentence describing the angle.' },
      },
      required: ['slug', 'content', 'summary'],
    },
  },
];

export function toolsOutline(pack: DraftingPack): ToolDef[] {
  return [
    {
      name: 'propose_series',
      description:
        'Propose the structure of a multi-article series. The user will review before any drafts are written.',
      input_schema: {
        type: 'object',
        properties: {
          seriesName: {
            type: 'string',
            description: 'Short slug-like identifier used as the series: frontmatter value.',
          },
          seriesTitle: { type: 'string', description: 'Human-readable series title.' },
          seriesNote: {
            type: 'string',
            description: 'Editor note: how the articles divide the territory and cross-link.',
          },
          articles: {
            type: 'array',
            minItems: 2,
            maxItems: 6,
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                slug: { type: 'string', description: 'URL-safe slug, hyphenated, lowercase.' },
                category: { type: 'string', enum: pack.content.categories },
                summary: { type: 'string', description: 'One-sentence angle + audience.' },
                keyPoints: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 8 },
              },
              required: ['title', 'slug', 'category', 'summary', 'keyPoints'],
            },
          },
        },
        required: ['seriesName', 'seriesTitle', 'articles'],
      },
    },
  ];
}

export const TOOLS_SERIES_DRAFT: ToolDef[] = [
  {
    name: 'create_series',
    description: 'Commit all sibling articles in the series as drafts. One atomic commit.',
    input_schema: {
      type: 'object',
      properties: {
        seriesName: { type: 'string' },
        articles: {
          type: 'array',
          minItems: 2,
          items: {
            type: 'object',
            properties: {
              slug: { type: 'string' },
              content: {
                type: 'string',
                description: 'Complete markdown including frontmatter (with `series: "<seriesName>"`).',
              },
              summary: { type: 'string' },
            },
            required: ['slug', 'content', 'summary'],
          },
        },
      },
      required: ['seriesName', 'articles'],
    },
  },
];

export const TOOL_VERIFY_CITATION: ToolDef = {
  name: 'verify_citation',
  description:
    'Verify a research claim against the citation verifier and resolve the real source(s) behind it. Read-only — does NOT modify the article. Pass a single specific claim (or a source title/topic to resolve its identifier). Returns ranked sources with real identifiers, title, year, a relevant verbatim quote, and a per-source verdict (supports/partial/contradicts/unrelated/unknown). This is the ONLY sanctioned source of identifiers — never recall them from memory. Call it (you may batch several claims in one turn) BEFORE adding or keeping any citation.',
  input_schema: {
    type: 'object',
    properties: {
      claim: {
        type: 'string',
        description:
          'A single, specific factual claim to verify. Or a source title/topic when you just need to resolve its identifier.',
      },
    },
    required: ['claim'],
  },
};

export const TOOL_UPDATE_ARTICLE: ToolDef = {
  name: 'update_article',
  description:
    'Replace the currently-open article with a new version. Use for any change that only affects this one article. Return the COMPLETE new markdown including frontmatter.',
  input_schema: {
    type: 'object',
    properties: {
      newContent: { type: 'string', description: 'Complete new markdown including frontmatter.' },
      summary: { type: 'string', description: 'One past-tense sentence describing what changed.' },
    },
    required: ['newContent', 'summary'],
  },
};

export const TOOL_UPDATE_ARTICLES: ToolDef = {
  name: 'update_articles',
  description:
    'Replace one or more articles atomically — use when a change spans multiple sibling articles (moving content, rewriting cross-links across files, splitting, merging). Include the open article if it changes. Omit unchanged siblings.',
  input_schema: {
    type: 'object',
    properties: {
      updates: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            slug: { type: 'string', description: 'Slug of the article to update.' },
            newContent: { type: 'string', description: 'Complete new markdown including frontmatter.' },
          },
          required: ['slug', 'newContent'],
        },
      },
      summary: {
        type: 'string',
        description: 'One past-tense sentence describing what changed across the affected files.',
      },
    },
    required: ['updates', 'summary'],
  },
};

/** The chat tool list. When no verifier is configured, verify_citation is
 *  dropped so the model can't call a tool that always reports "disabled". */
export function chatTools(verifierConfigured: boolean): ToolDef[] {
  const base = [TOOL_UPDATE_ARTICLE, TOOL_UPDATE_ARTICLES];
  return verifierConfigured ? [TOOL_VERIFY_CITATION, ...base] : base;
}

export const EXTRACT_CLAIMS_TOOL: ToolDef = {
  name: 'extract_claims',
  description: 'Return the extracted research claims.',
  input_schema: {
    type: 'object',
    properties: {
      claims: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to 8 self-contained research claims, most important first. Empty if none.',
      },
    },
    required: ['claims'],
  },
};

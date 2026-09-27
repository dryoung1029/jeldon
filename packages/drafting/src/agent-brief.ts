/**
 * Agent drafting mode (`capabilities.drafting: 'agent'`).
 *
 * For a novice owner the drafter is a coding agent (Claude Code's `/article`),
 * not the API pipeline. Helix's `/article` command carried its OWN copy of the
 * voice + GEO rules — the exact "voice block duplicated" drift the engine was
 * built to kill. `buildAgentBrief` renders the SAME prompt builders the API
 * pipeline uses (`buildVoice`, `buildGeoPlaybook`, the citation rules, the tag
 * vocabulary, the frontmatter shape) as one markdown brief a coding agent
 * follows. `jeldon brief <topic>` prints it. No API key is involved.
 */
import { articlePathPrefix } from '@jeldon/config';
import { buildGeoPlaybook, buildVoice } from './prompts.js';
import type { DraftingPack } from './types.js';

export interface AgentBriefOptions {
  /** The topic / working title / question the article should answer. */
  topic?: string;
  /** ISO date for `publishDate`. Default: today (UTC). */
  today?: string;
  /** Extra site pages the agent may link to (kit page map). */
  internalLinks?: Array<{ label: string; url: string }>;
  /** Optional owner notes captured before drafting ("what I tell members…"). */
  ownerNotes?: string;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function citationRules(pack: DraftingPack): string {
  const p = pack.citation;
  const searchUrlOk = p.policy === 'search-urls-only' || p.policy === 'direct-source-urls';
  const verifier =
    p.verifier.kind === 'none'
      ? 'No automated verifier is configured: YOU are the verifier. Open every reference URL before publishing and confirm it says what the article says it says. If it does not, cut the claim.'
      : `A ${p.verifier.kind} verifier is configured; identifiers it did not return are not allowed.`;
  return [
    `- Policy: \`${p.policy}\`. ${
      searchUrlOk
        ? 'Real source URLs are the reference format; never invent an identifier (PMID/DOI/case number) from memory.'
        : 'Only verifier-returned identifiers may appear.'
    }`,
    `- Reference entry format: ${p.referenceFormat}`,
    `- Every evidence claim (${pack.scoring.seo.evidenceTriggers.slice(0, 8).join(', ')}, …) needs a matching entry under a \`## References\` H2 with a working link — or the claim gets cut. Cite it or remove it; never hedge around it.`,
    `- ${verifier}`,
    ...(p.forbiddenPatterns.length
      ? [`- Forbidden patterns (lint fails on these): ${p.forbiddenPatterns.map((f) => `\`${f}\``).join(', ')}`]
      : []),
  ].join('\n');
}

function seoTargets(pack: DraftingPack): string {
  const s = pack.scoring.seo;
  const [lo, hi] = pack.drafting?.wordCountTarget ?? s.wordCount.good;
  return [
    `- Title ${s.title.good[0]}–${s.title.good[1]} characters, containing the question people actually search.`,
    `- \`excerpt\` ${s.excerpt.good[0]}–${s.excerpt.good[1]} characters that answers the question in one line.`,
    `- ${lo}–${hi} words. Flesch-Kincaid grade ${s.reading.good[0]}–${s.reading.good[1]} (short sentences, common words).`,
    `- ${s.h2.good[0]}–${s.h2.good[1]} H2 sections; phrase them as questions where natural.`,
    `- At least ${s.internalLinks.good} internal links (paths starting with ${s.internalLinkPrefixes.map((p) => `\`/${p}/\``).join(', ')}).`,
    `- ${s.tags.good[0]}–${s.tags.good[1]} tags${pack.content.tags?.length ? ' from the vocabulary below' : ''}.`,
    `- Slug: lowercase, hyphenated, ≤ ${s.slugMaxLen} characters, sharing a word with the title.`,
  ].join('\n');
}

function tagBlock(pack: DraftingPack): string {
  const vocab = pack.content.tags ?? [];
  if (!vocab.length) return 'Tags are free-form: lowercase, hyphenated, topical.';
  return `Choose tags ONLY from this vocabulary, exact spelling:\n${vocab.map((t) => `\`${t}\``).join(', ')}`;
}

function frontmatterBlock(pack: DraftingPack, today: string): string {
  const author = pack.authors.find((a) => a.slug === pack.content.defaultAuthorSlug) ?? pack.authors[0];
  return `\`\`\`yaml
---
title: "…"
excerpt: "…"
publishDate: ${today}
category: <one of: ${pack.content.categories.join(' | ')}>
tags: ["…", "…", "…"]
author: "${author?.name ?? ''}"
authorSlug: ${author?.slug ?? ''}
draft: true
docNotes: "Drafted by the agent on ${today}; sources verified ${today}"
---
\`\`\``;
}

/** Render the complete drafting brief for a coding agent. */
export function buildAgentBrief(pack: DraftingPack, opts: AgentBriefOptions = {}): string {
  const today = opts.today ?? isoToday();
  const topic = opts.topic?.trim();
  const target = (c: string) => pack.content.categoryTargets[c] ?? pack.scoring.geo.floor;
  const links = opts.internalLinks?.length
    ? `\n\nPages you may link to:\n${opts.internalLinks.map((l) => `- ${l.label}: \`${l.url}\``).join('\n')}`
    : '';
  const notes = opts.ownerNotes?.trim() ? `\n\n## What the owner said about this topic\n\n${opts.ownerNotes.trim()}` : '';

  return `# Drafting brief — ${pack.brand.name}${topic ? `: ${topic}` : ''}

Generated by \`jeldon brief\` from \`jeldon.config.ts\`. This is the same voice
block and GEO playbook the engine's API pipeline uses; do not keep a private
copy of these rules anywhere else. Output: one markdown file at
\`${pack.content.articlePathPrefix ? `src/content/articles/<slug>.md` : 'src/content/articles/<slug>.md'}\`
(published at \`${articlePathPrefix(pack)}<slug>/\`) with \`draft: true\`.
Publishing is a separate, owner-approved step.${notes}

## 1. Voice

${buildVoice(pack)}

## 2. Search targets (SEO scorer bands)

${seoTargets(pack)}

## 3. Citability (GEO scorer)

Category targets: ${pack.content.categories.map((c) => `${c} ${target(c)}+`).join(' · ')}. Floor ${pack.scoring.geo.floor}.
${buildGeoPlaybook(pack)}

## 4. Citations

${citationRules(pack)}

## 5. Tags

${tagBlock(pack)}

## 6. Frontmatter (exact shape)

${frontmatterBlock(pack, today)}${links}

## 7. Before you hand it over

1. \`jeldon score src/content/articles/<slug>.md\` — read the \`meh\`/\`bad\` rows.
2. Fix weak checks WITHOUT flattening the voice; if a fix would make it sound like a textbook, leave the score and say so. Voice wins.
3. Re-open every reference link once more.
4. Never set \`draft: false\` here. Never cite a source you have not opened. Never invent a customer story.
`;
}

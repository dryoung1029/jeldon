# Jeldon in this repo

Jeldon (github.com/dryoung1029/jeldon) is the content engine. This repo is a
Jeldon **local-business kit** consumer, spawned by `jeldon init`.

## What's used

| Package | Used for | Needs a key? |
|---|---|---|
| `@jeldon/config` | Loads and validates `jeldon.config.ts` (the Domain Pack) | no |
| `@jeldon/core-scoring` | SEO + GEO (AI-citability) + reading-level scoring | no |
| `@jeldon/content-model` | Article frontmatter schema, draft/ready/scheduled/live rules | no |
| `@jeldon/schema-graph` | JSON-LD: Organization/LocalBusiness, WebSite, Person, Article, FAQPage, breadcrumbs; sitemap exclusion; llms.txt | no |
| `@jeldon/verify` | Citation lint | no |
| `@jeldon/competitive-intel` | Competitor site scanner + gap comparison (`npm run competitors`) | no (PageSpeed key optional) |
| `@jeldon/crawler-analytics` | Search Console CSV parser (`npm run traffic`) | no |
| `@jeldon/kit-local-business` | Design tokens, contact route adapters, booking, redirects, the kit's doctor checks | no |
| `@jeldon/benchmark` | Old-vs-new scorecard on ten dimensions (`npm run benchmark`) | no (PageSpeed key optional) |
| `@jeldon/cli` | `validate`, `doctor`, `check-geo-floor`, `score`, `brief`, `benchmark` | no |
| `@jeldon/drafting` | Prompt builders — used through `npm run brief` (agent mode). The API pipeline is off. | no in agent mode |

Engine updates arrive automatically: Renovate opens a PR when a `@jeldon/*`
version bumps and auto-merges it on green CI.

## The Domain Pack (`jeldon.config.ts`) — fields that matter here

- `brand` — name, canonical URL, tagline, NAP, logo, `brandColors` (+ `fonts`).
  Feeds the LocalBusiness JSON-LD and the site's design tokens.
- `authors[0]` — the owner. `schemaId` is the `@id` every article links to;
  `profile` becomes the Person node on `{{routeTeam}}`. `urlPrefix` is `{{routeTeam}}`.
- `voice` — persona, banned topics/phrasings, rules, reading band. `npm run
  brief` renders this for `/article`. `voiceAnchorUrls`: 1–2 published articles
  the owner says sound like them.
- `content` — categories, per-category GEO targets, curated tags,
  `articlePathPrefix: '{{routeBlog}}'` (must equal `kit.config.ts → routes.blog`).
- `scoring` — engine defaults with the `{{vertical}}` preset's first-person
  markers and citation sources; `internalLinkPrefixes` list the site's routes.
- `citation.policy` — `direct-source-urls`: references are real links; Claude
  opens every link before publishing.
- `aeo.querySet` — the questions we want to be the answer to. Used by
  `/reddit-ideas` and `/article` for topic selection.
- `competitors` — roster, target keywords, template fingerprints.
- `schema` — `orgType`, `emitLlmsTxt: true` with a curated `llmsTxt` block.
- `compliance.pack` — `{{compliancePack}}`{{#if hipaa}} (the kit switches to the no-health-details form copy and the BAA note){{/if}}.
- `capabilities.drafting: 'agent'` — Claude Code drafts; no API key needed.
- `services.store: 'fs'` — the repo is the database.

Validation invariants (doctor checks them): floor ≤ every category target;
`defaultAuthorSlug` matches an author; query set non-empty; `routes.blog`
equals `articlePathPrefix`.

## Score one file by hand

```
npm run score -- {{contentDirArticles}}/<slug>.md          # plain words
npm run score -- {{contentDirArticles}}/<slug>.md -- --json # machine
```

`npm run check:geo -- <file>` scores a draft too (drafts are skipped only when
no file is named).

## If the engine needs a change

If a page needs a value the config doesn't expose, that is an engine change,
not a project change: note it in `docs/PROGRESS.md` under "For {{helperName}}"
with the file and the value, and use the closest config-driven workaround in
the meantime. Never edit `node_modules/@jeldon/*`.

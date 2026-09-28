# AGENTS.md — this Jeldon-powered project

> Entry point for any AI coding agent working in THIS repo. This is a *consumer*
> of the Jeldon engine, not the engine itself. Keep this file lean; depth lives
> in the engine docs linked below.

## What this is

A content site built on **Jeldon Core**. The engine lives in published
`@jeldon/*` packages. You specialize it by editing **one file**:
`jeldon.config.ts` (the Domain Pack). Everything domain-specific — brand,
authors, voice, scoring weights + regexes, citation policy, AEO query set,
schema types, capabilities — is a value in that file. The engine hardcodes
nothing about this vertical.

## The one rule

**Edit `jeldon.config.ts`. Do not edit `@jeldon/*` source.** If you need a value
the config does not expose, that is an *engine* change (a PR to Jeldon Core),
not a project change. The app scaffold under `src/` is thin and reads every
domain value from the pack via `src/lib/pack.ts`.

## Stack

Astro 5 + Cloudflare Workers (`@astrojs/cloudflare`). pnpm. The article content
model, scoring, schema graph, and citation verification all come from
`@jeldon/*`.

## Commands

Scripts call each tool's JS entry directly (`node node_modules/astro/astro.js`),
so a bin-less `npm ci` still works.

```
npm install
npm run check:engine       # the engine resolves (guards the swallowed-dist bug)
npm run validate           # jeldon validate — Domain Pack shape
npm run doctor             # jeldon doctor — "wired correctly?" (config + env + registered checks)
npm run build              # production build (drafts excluded)
INCLUDE_DRAFTS=true npm run build   # preview build (drafts rendered, noindex)
npm run check:geo -- <file>   # GEO floor — score articles vs category targets (drafts only when named)
npm run check:citations    # citation lint under pack.citation.policy
npm run check:frontmatter  # validate frontmatter vs the derived schema
npm run deploy:cf -- --dry-run   # the Worker + assets upload, without deploying
```

## CI (`.github/workflows/ci.yml`)

One workflow, named steps — each backed by a `@jeldon/*` package, no mirrored
logic: engine resolves · validate + doctor · frontmatter · citations · geo-floor
· types · production build · preview build · `wrangler deploy --dry-run`.

Engine updates arrive automatically: a `@jeldon/*` version bump opens a Renovate
PR that **auto-merges on green CI** (`renovate.json`).

## Setup / runbook

Follow the engine's runbook step by step; stop at its STOP condition:

- **Runbook:** `docs/IMPLEMENTATION.md` (in the Jeldon Core repo) — the
  deterministic checklist for standing this project up.
- **Field-by-field config guide:** `docs/DOMAIN-PACK.md`.
- **Engine/pack split + adapters:** `docs/ARCHITECTURE.md`.
- **Non-negotiable invariants:** `docs/CONSTITUTION.md`.
- **Golden reference config:** `examples/jeldon.config.example.ts` (the
  fully-filled "Northwatch" non-health pack — diff your `jeldon.config.ts`
  against it for shape).

## Where things are

- `jeldon.config.ts` — the Domain Pack. The only file you edit to specialize.
- `src/lib/pack.ts` — loads the pack once; every page reads domain values here.
- `src/content.config.ts` — Astro 5 content layer; article schema **derived** from `pack.content.categories`.
- `src/layouts/BaseLayout.astro` — emits the JSON-LD graph from the pack.
- `src/pages/articles/` — the list + `[slug]` detail pages (move the folder if
  you change `content.articlePathPrefix`; every link is built from the pack).
- `scripts/` — the thin CI steps (`lint-citations`, `check-frontmatter`); geo-floor is `jeldon check-geo-floor`.
- `wrangler.jsonc` — Workers config (`main` + `assets`); R2/D1/KV bindings ship
  commented, fill as you enable capabilities. `public/.assetsignore` keeps the
  Worker bundle out of the asset upload.
- Build-time code imports `@jeldon/config/load`; a server route must import the
  root `@jeldon/config` (no jiti / `node:fs` in the Worker bundle).

# {{ project name }} — built on Jeldon Core

This is a Jeldon-powered content site. The engine lives in published `@jeldon/*`
packages; **you specialize it by editing one file: `jeldon.config.ts`.**

## Getting started

```bash
pnpm install
pnpm run doctor -- --pre    # see what still needs filling (warns, doesn't error)
# edit jeldon.config.ts (diff against examples/jeldon.config.example.ts)
pnpm run validate           # Domain Pack shape is valid
pnpm run doctor             # green = wired correctly (config + env)
pnpm run build              # production build
INCLUDE_DRAFTS=true pnpm run build   # preview build (drafts rendered, noindex)
```

Follow the full runbook in the engine repo's `docs/IMPLEMENTATION.md`. Do not
edit `@jeldon/*` source — if you need a value the config does not expose, that is
an engine change, not a project change.

## What's in the box

- **`jeldon.config.ts`** — the Domain Pack. The only file you edit to specialize.
- **`examples/jeldon.config.example.ts`** — the golden "Northwatch" reference.
- **Astro 5 + Cloudflare Workers app** (`src/`, `astro.config.mjs`,
  `wrangler.toml`) — a minimal but real app: a BaseLayout that emits the JSON-LD
  graph from the pack, an articles list + `[slug]` detail page reading the
  content collection, and a content schema **derived** from
  `pack.content.categories`. Every domain value flows from the config.
- **CI gates** (`.github/workflows/`) — `geo-floor`, `citation-lint`,
  `build-parity`, `frontmatter-guard`, `doctor`. Each runs a `@jeldon/*`-backed
  step, no mirrored logic.
- **`renovate.json`** — auto-updates `@jeldon/*` and auto-merges on green CI, so
  engine improvements arrive hands-off.

## How updates reach you

- **Engine packages** ride Renovate — a `@jeldon/*` bump opens a PR that
  auto-merges on green CI.
- **Template/scaffold changes** sync via the template-update workflow.
- **Structural migrations** ship as codemods (`npx jeldon migrate`).

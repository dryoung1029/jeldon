# AGENTS.md — Jeldon Core

> Canonical entry point for any AI coding agent (Claude Code, Codex, Cursor)
> working in this repo. Keep it lean. Depth lives in `docs/`, pulled on demand.
> `CLAUDE.md` and `.github/copilot-instructions.md` should symlink here.

## What this is

Jeldon Core is a **portable article + AEO/SEO + analytics engine**. It is the
extracted, domain-agnostic engine behind a proven content-ranking platform
(originally "Body of Health"). The whole design rests on one split:

- **The ENGINE** = versioned `@jeldon/*` packages. Domain-agnostic. Hardcodes
  nothing about any vertical. You almost never edit these.
- **The DOMAIN PACK** = one file, `jeldon.config.ts`, that specializes the
  engine for a project. In a consumer project this is the *only* file you edit.

> **If you are setting up Jeldon in a new project, you are NOT in this repo.**
> You clone the `template/`, fill `jeldon.config.ts`, and run `jeldon doctor`.
> Follow `docs/IMPLEMENTATION.md` step by step. Stop when doctor exits 0 and CI
> is green.

## Stack

pnpm + Turborepo + Changesets monorepo · TypeScript (ESM) · Zod (config schema)
· tsup (build) · Vitest (test). Consumers deploy on **Astro 5 + Cloudflare
Workers**.

## The five things that matter

1. `packages/config/` — the Domain Pack contract (`@jeldon/config`). The keystone.
2. `packages/*/` — the engine modules. Each reads config, hardcodes no domain values.
3. `template/` — the thin starter consumers clone. Keep it minimal.
4. `docs/` — the agent-facing docs (see `docs/` index below).
5. `schemas/` — JSON-Schema source of truth, generated from the Zod schema.

## Commands

```
pnpm install
pnpm build            # turbo build all packages
pnpm test             # turbo test
pnpm typecheck
pnpm gen:schema       # regenerate schemas/ from the Zod schema
npx jeldon validate   # validate a project's jeldon.config.ts
npx jeldon doctor     # the "wired correctly?" gate (--json for machines)
```

## Hard boundaries (see docs/CONSTITUTION.md for the full list)

- **The engine never hardcodes a domain value.** Brand strings, weights,
  regexes, prompts, IDs all live in the Domain Pack. A literal like
  `pubmed.ncbi.nlm.nih.gov` in `packages/*` is a bug.
- **Voice always wins over score.** If hitting a score check would warp the
  prose, pull the claim. Removing beats flattening.
- **Compliance is opt-in.** HIPAA/legal/finance rules load via
  `compliance.pack`, never baked into core. Default is `none`.
- **One scorer, no mirrors.** `@jeldon/core-scoring` is the only scoring source;
  the editor dial imports the same package. Never hand-copy scoring logic.
- **Keep this file lean.** Do not grow AGENTS.md into a session log. That is the
  anti-pattern that exhausts the instruction budget. Put depth in `docs/`.

## docs/ index

| File | Read it when |
|---|---|
| `docs/CONSTITUTION.md` | Always. Non-negotiable invariants. |
| `docs/IMPLEMENTATION.md` | Standing Jeldon up in a new project. The runbook. |
| `docs/ARCHITECTURE.md` | Understanding the engine/pack split + adapters. |
| `docs/DOMAIN-PACK.md` | Filling or extending `jeldon.config.ts`. |
| `docs/MODULE-CATALOG.md` | Working on a specific `@jeldon/*` package. |
| `docs/AEO-PLAYBOOK.md` | Deciding what actually drives ranking/citation. |
| `docs/DECOUPLING-NOTES.md` | Porting more BoH code into a package. |
| `docs/ROADMAP.md` | Checking what is built vs scaffolded. |

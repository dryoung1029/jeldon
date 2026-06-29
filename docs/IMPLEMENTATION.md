# Implementation Runbook

The deterministic checklist for standing Jeldon up in a **new project**. Written
for an AI coding agent; a human can follow it too. Every step ends in a
copy-pasteable acceptance criterion. Do not skip steps. Stop at the STOP
condition.

> You are working in a *consumer* repo (cloned from `template/`), not in the
> Jeldon Core monorepo. You edit `jeldon.config.ts` and project files — not
> `@jeldon/*` package source.

## Step 0 — Orient

Read `AGENTS.md` → `docs/CONSTITUTION.md` → this file. Internalize the engine vs
Domain Pack split: you specialize the engine by editing **one** config file.

**Acceptance:** you can state, in one sentence, what goes in `jeldon.config.ts`
vs what stays in `@jeldon/*`.

## Step 1 — Scaffold

```bash
npx degit dryoung1029/jeldon/template my-site
cd my-site && pnpm install
```

**Acceptance:** `pnpm install` exits 0; `@jeldon/config` and
`@jeldon/core-scoring` resolve (`node -e "require.resolve('@jeldon/config')"`).

## Step 2 — First doctor pass

```bash
npx jeldon doctor --pre
```

This reports config and env gaps as a TODO list (warns, not errors, in `--pre`).

**Acceptance:** doctor runs and prints a gap list you can work through.

## Step 3 — Fill the Domain Pack

Open `jeldon.config.ts`. Fill every field, diffing against
`examples/jeldon.config.example.ts` (the golden Northwatch config) for shape.
Field-by-field reference: `docs/DOMAIN-PACK.md`. Key decisions:

- `brand`, `authors`, `voice` — the identity + tone.
- `content.categories` + `categoryTargets` — your taxonomy and per-category GEO goals.
- `scoring` — start from `defaultScoringConfig`, override the **citation
  `patterns`** to your domain's real sources (RFCs, case law, SEC filings, etc.),
  the **firstPerson markers**, and the **reading band**. This is where most
  domains differ.
- `citation.policy` + `verifier` — pick one explicitly.
- `aeo.querySet` — ≥3 real queries your audience asks answer engines.
- `compliance.pack` — `none` unless you are in a regulated vertical.
- `capabilities` — turn on only what you will use.
- `services.requiredEnv` — every secret the enabled capabilities need.

**Acceptance:** `npx jeldon validate` passes.

## Step 4 — Wire secrets

Set `services.requiredEnv` values as environment variables / Cloudflare + GitHub
secrets (store token, LLM keys, analytics token, etc.).

**Acceptance:** `npx jeldon doctor` env checks are all ✔.

## Step 5 — Full doctor pass

```bash
npx jeldon doctor
```

**Acceptance:** zero errors. Warnings are allowed (e.g. "no voiceAnchorUrls" is
a soft signal) but read each one.

## Step 6 — Build parity

```bash
pnpm build
INCLUDE_DRAFTS=true pnpm build
```

**Acceptance:** both builds green; the sitemap excludes drafts and stubs.

## Step 7 — Prove the scorer on real content

Author or import one article, then:

```bash
npx jeldon check-geo-floor src/content/articles/<slug>.md
```

**Acceptance:** the article scores at or above its category target; the
`geo-floor` CI gate would pass.

## Step 8 — Dry-run the AEO audit

```bash
npx jeldon audit --engines perplexity,anthropic --dry-run
```

**Acceptance:** returns a snapshot; brand-match logic resolves your brand
mentions.

## Step 9 — Open a PR

**Acceptance / STOP condition:** `jeldon doctor` exits 0 **AND** all CI gates
(geo-floor, citation-lint, build-parity, frontmatter-guard, doctor) are green
**AND** one article scores ≥ its category target. When all three hold, the
project is correctly primed. Stop.

---

## Updating the engine later

Engine improvements reach a consumer project automatically:

- **Package updates** ride **Renovate** — a `@jeldon/*` version bump opens an
  auto-update PR; it auto-merges on green CI. No hand-porting.
- **Template/scaffold changes** sync via `copier update` (or the template-sync
  workflow), which opens a PR carrying the diff.
- **Structural migrations** ship as codemods: `npx jeldon migrate`. See
  `docs/MIGRATION.md`.

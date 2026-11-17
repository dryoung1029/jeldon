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

## Admin access (when the project has admin routes)

`template/src/middleware.ts` gates `security.adminPrefixes` with
`@jeldon/access`. Three rules, each learned from a real exposure:

1. **Cover every hostname the deployment answers on.** Every Workers preview /
   version URL (`*.workers.dev`, and on Pages every `<id>.<project>.pages.dev`
   and `<branch>.<project>.pages.dev`) serves the same admin routes as the
   production domain. An Access application that covers only the custom
   domain leaves those open. In the source system a deployment URL served
   `/admin` and `/api/admin/drafts` to an unauthenticated curl, with the
   production GitHub token behind them (2026-10-27). Add every such hostname
   to the Access application, or turn the preview URLs off.
2. **Set `security.access` (`teamDomain`, `aud`).** The middleware verifies the
   Access JWT at the origin, so a hostname the policy misses still refuses.
   Without these values protected routes answer 500; they never pass through.
   Neither value is secret. `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` env vars
   override them at runtime. Only `astro dev` skips the check.
3. **Protected pages and endpoints must be on-demand**
   (`export const prerender = false`). A prerendered page is a static asset,
   served without running the worker or the middleware.

**Acceptance:** against a built worker (`wrangler dev`), `/admin`,
`//admin`, `/%61dmin` and `/ADMIN` answer 401 with no token and with a bogus
token; public pages answer 200.

**Deploy race.** The host serves the most recently *completed* production
build, not the newest commit. Two pushes close together can leave the older
build live (seen in the source system: the older commit's build finished four
seconds later and won). If "main is merged but prod is stale", compare the two
builds' finish times first; any new push clears it. This is why the site-alert
admin flow polls the live homepage (`waitForLiveVersion` in
`@jeldon/site-alert`) instead of trusting "saved".

## Updating the engine later

Engine improvements reach a consumer project automatically:

- **Package updates** ride **Renovate** — a `@jeldon/*` version bump opens an
  auto-update PR; it auto-merges on green CI. No hand-porting.
- **Template/scaffold changes** sync via `copier update` (or the template-sync
  workflow), which opens a PR carrying the diff.
- **Structural migrations** ship as codemods: `npx jeldon migrate`. See
  `docs/MIGRATION.md`.

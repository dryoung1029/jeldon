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

## Step 1 — Spawn the site with `jeldon init`

```bash
mkdir my-site && cd my-site
npx jeldon init . --kit local-business \
  --name "Helix Training" \
  --url https://helixtrain.com \            # canonical host of the NEW site
  --from https://www.helixtrain.com \       # the OLD site to learn from
  --crm pushpress --notify brevo
# or, for an agent in another session: fill schemas/init-answers.schema.json and
npx jeldon init . --answers answers.json
```

What it does, in order (each step idempotent; re-running fills gaps):

1. **Scrapes the old site** (`@jeldon/competitive-intel`): title/description,
   NAP from schema, phone, social links, logo, nav labels, every sitemap URL,
   blog posts (migrated as drafts), booking/checkout vendors by host, the
   Search Console tag, the template vendor. **Stores the baseline scorecard**
   (`data/benchmark/baseline.json`) — the number the new site must beat.
2. **Interviews** (or reads `--answers`): only what the scrape couldn't find or
   must be confirmed. Every scraped fact is written with a `SETUP:` marker
   until the owner confirms it in `/setup`. The wizard confirms; it never supplies.
3. **Generates**: `jeldon.config.ts` (with the vertical's scoring preset —
   `gym`, `clinic`, `studio`, `shop`, `generic`), `kit.config.ts`, content for
   services/team/FAQs, `public/_redirects` + `docs/OLD-URLS.md` from one
   redirect plan, the rendered agent kit (`CLAUDE.md`, `.claude/commands/*`,
   `docs/*`), CI, README.
4. **Verifies**: `npm install`, `jeldon validate`, `jeldon doctor --pre`,
   `astro build`, `INCLUDE_DRAFTS=true astro build`. Prints the `SETUP:` marker
   count and the next step.

**Acceptance:** exit 0; `data/benchmark/baseline.json` exists; the printed
page list contains the site's public pages at the configured routes.

> Until `@jeldon/*` is on npm, pass `--vendor-from vendor/@jeldon` after
> `node scripts/vendor-engine.mjs <dir>` from the engine repo (the same
> `file:` shape Helix used). `pnpm smoke:template --kit local-business` runs
> the whole consumer gate set the same way.

### Reproducing the reference consumer

`examples/helix.answers.json` is the answers file for Helix Training.
`npx jeldon init /tmp/helix2 --kit local-business --from https://www.helixtrain.com --answers examples/helix.answers.json`
produces the same 15 indexable pages at the same URLs as
`dryoung1029/helix-site-template` (home, programs + 5 program pages, schedule,
pricing, coaches, blog, free-class, contact, faq, about; members/privacy/terms/
thanks noindex), the same redirect map, the same seed article as a draft.
Expected differences in `diff -r`: `vendor/` absent; `kit.config.ts` replaces
`site.config.ts`; `src/lib/pushpress.ts`, `ProgramList.astro`, `global.css` and
`scripts/check-site.mjs` are replaced by the kit package (tokens are inlined
from the pack, checks are registered); prose in the agent kit is
label-rendered rather than hand-written; brand image binaries are not
generated (upload in `/setup` stage 5).

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

## Step 9 — Benchmark against the old site

```bash
npx jeldon benchmark --old https://www.old-site.com --new https://<project>.workers.dev
npx jeldon benchmark --ci        # NEW vs the stored baseline; exit 1 on any "behind"
```

**Acceptance:** every dimension is **win** or **tie** (speed needs
`PAGESPEED_API_KEY` and a public URL). `data/benchmark/scorecard-<date>.md` is
committed. The agent kit's `/launch` refuses while anything is behind. The
reference run (Helix old site vs the spawned build, 7 win / 2 tie / 0 behind)
is in `examples/helix/benchmark/` with the redirect plan it produced.

## Step 10 — Hand to the owner

Send the owner `docs/START-HERE.md` (four steps: GitHub account, "Use this
template", open in Claude Code, type `/setup`) and the note in
`docs/KICKOFF-MESSAGE.md`. From here the **owner never uses a terminal**: the
agent runs every command; the owner clicks in browsers and answers questions.
`/setup` confirms every `SETUP:` marker, `/article` drafts with
`npm run brief` (the engine's prompts), `/publish` needs the owner's approval,
`/launch` is a two-person DNS step with the named helper.

**Acceptance / STOP condition:** `jeldon doctor` exits 0 **AND** the consumer
CI workflow is green **AND** `jeldon benchmark --ci` shows nothing behind
**AND** the owner has `START-HERE.md`. Stop.

---

## Updating the engine later

Engine improvements reach a consumer project automatically:

- **Package updates** ride **Renovate** — a `@jeldon/*` version bump opens an
  auto-update PR; it auto-merges on green CI. No hand-porting.
- **Template/scaffold changes** sync via `copier update` (or the template-sync
  workflow), which opens a PR carrying the diff.
- **Structural migrations** ship as codemods: `npx jeldon migrate`. See
  `docs/MIGRATION.md`.

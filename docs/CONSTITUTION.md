# Jeldon Constitution

Non-negotiable invariants. Every agent reads this before touching the repo.
These are not style preferences — violating them breaks the portability or the
predictability the whole system depends on.

## 1. The engine never hardcodes a domain value

Brand strings, place IDs, URLs, voice rules, prompt text, scoring weights, and
detection regexes live in the **Domain Pack** (`jeldon.config.ts`), never in
`packages/*`. A literal like `yourbodyofhealth.com`, `pubmed.ncbi.nlm.nih.gov`,
`Dr. Jason Young`, or `[25,25,15,15,10,10]` inside an engine package is a bug.
If you need a value the config does not expose, **add a config key** — do not
inline the value.

## 2. Voice always wins over score

The scoring engine is a guide, not a boss. If raising a GEO/SEO check would warp
the author's voice (e.g. laundering "when I see patients…" into "research has
demonstrated…"), **pull the claim instead**. Removing beats flattening. The
score can land below target with the voice intact; that is the correct outcome.

## 3. Compliance is opt-in, never baked in

YMYL/regulatory rules (HIPAA, legal, finance) load through `compliance.pack`.
The engine ships generic `Article`/`Organization` schema and no domain rules by
default (`pack: 'none'`). Health-specific behavior — "never confirm/deny patient
status," `MedicalWebPage` schema, PubMed citation policy — exists only because a
pack requested it. Never assume a health context.

## 4. One scorer, no mirrors

`@jeldon/core-scoring` is the single source of scoring truth. It is isomorphic —
the editor dial (browser) and CI (Node) import the **same** package. Never
hand-copy scoring logic into an Astro page, a cron script, or a competitor
scanner. The historical "TS lib vs inline JS mirror" drift bug is designed out;
do not reintroduce it.

## 5. Adapters, not assumptions

Persistence (`Store`), analytics (`AnalyticsProvider`), object storage
(`ObjectStore`), and claim verification (`ClaimVerifier`) are interfaces.
Cloudflare, GitHub, and cite8 are *adapters*, each with a null/FS/SQLite
fallback. Engine code talks to the interface, never directly to `github.ts`, a
CF GraphQL endpoint, or `cite8.dev`.

## 6. Never fabricate citations or anecdotes

A citation's identifier (PMID/DOI/RFC/CVE) must be verifiable — sourced from the
configured verifier, never recalled from memory. A wrong digit silently points
at the wrong source. Likewise, never invent a patient/customer story; replace
specific anecdotes with general framing unless the value is explicitly real.
This rule is engine-wide and not health-specific.

## 7. Audio/newsletter frontmatter is owned by its module

Fields written out-of-band (`audio*`, `newsletter*`) are never hand-edited. The
content model preserves unknown frontmatter on save so these survive edits. If
you must regenerate, use the owning module's path.

## 8. Keep AGENTS.md and the docs lean

Documentation is for *doing a task*, not narrating history. Do not grow
`AGENTS.md` into a session log — that exhausts the agent instruction budget and
is the explicit anti-pattern this repo was designed to avoid. Session history
belongs in commit messages and changesets, not in the constitution.

## 9. Definition of done is verifiable

Work is done when `jeldon doctor` exits 0, all CI gates are green, and (for
content) the article scores at or above its category target. "Looks right" is
not done. The runbook's STOP condition is the contract.

# Architecture

## The split

```
┌─────────────────────────────────────────────────────────────┐
│  DOMAIN PACK  (jeldon.config.ts)  — the only file you edit   │
│  brand · authors · voice · scoring weights+regexes ·         │
│  citation policy · AEO query set · competitors · schema ·    │
│  compliance pack (opt-in) · capabilities · services          │
└───────────────────────────┬─────────────────────────────────┘
                            │ validated by @jeldon/config (Zod + JSON Schema)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  THE ENGINE  — versioned @jeldon/* packages                  │
│  pure logic, hardcodes nothing about any vertical            │
└───────────────────────────┬─────────────────────────────────┘
                            │ interfaces, not assumptions
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  ADAPTERS  — Store · AnalyticsProvider · ObjectStore ·       │
│  ClaimVerifier   (GitHub / Cloudflare / cite8 + null/FS)     │
└─────────────────────────────────────────────────────────────┘
```

The engine is the **invariant**; the Domain Pack is the **only** thing a new
project edits. Everything below traces to that.

## Why a monorepo that publishes packages

Consumers are *separate, independently-deployed repos*. A monorepo is the right
*home* to build and version the engine, but not the *delivery vehicle*. So:

- The engine ships as semver'd `@jeldon/*` npm packages. ~90% of the surface
  rides this channel — a version bump fires a Renovate auto-PR into every
  consumer.
- The `template/` is the thin scaffold consumers clone (degit/copier). It is
  kept minimal so the only non-automated update path is tiny.
- Structural changes ship as `jeldon migrate` codemods.

**Design rule: minimize the template.** Push every line of logic that *can* be a
package *into* a package, so it rides the automated update channel.

## Package dependency shape

```
@jeldon/config                 (keystone — types, Zod schema, defaults, loader)
   ▲        ▲          ▲
   │        │          │
core-scoring  content-model  schema-graph  store  verify  …
   ▲
@jeldon/cli  (validate · doctor · check-geo-floor · audit · migrate)
```

`@jeldon/config` depends on nothing but `zod` + `jiti`. Every other package
depends on `@jeldon/config` for types and reads values from the loaded
`DomainPack`. No engine package depends on another's *domain* assumptions.

## The adapter interfaces (decoupling layer)

| Interface | Default adapter | Fallback | Replaces |
|---|---|---|---|
| `Store` | `GitHubStore` | `FsStore` | GitHub-as-database |
| `AnalyticsProvider` | `CloudflareAnalytics` | `NullAnalytics` | CF GraphQL coupling |
| `ObjectStore` | `R2Store` | `FsObjectStore` | R2 image/audio storage |
| `EventStore` | `D1Events` | `SqliteEvents` | engagement beacon |
| `ClaimVerifier` | `Cite8Verifier` (health plugin) | `NullVerifier` / `PrimarySourceVerifier` | cite8/PubMed hardwiring |

Engine code talks to the interface. The CF/GitHub/cite8 specifics are one
swappable adapter each, selected by `services.*` in the Domain Pack.

## Data flow (authoring → ranking → measurement)

1. **Author** — `@jeldon/drafting` injects `pack.voice` + priority keywords,
   drafts, scores via `@jeldon/core-scoring`, verifies via `@jeldon/verify`,
   self-heals one fix-pass, writes through `Store`.
2. **Publish** — `@jeldon/content-model` runs the lifecycle state machine
   (draft → docReviewed → ready → scheduled → live); the scheduled cron flips
   on publish date.
3. **Structured data** — `@jeldon/schema-graph` emits the JSON-LD graph from
   `pack.schema` + author profiles.
4. **Measure** — `@jeldon/aeo-audit` runs the citation-presence audit;
   `@jeldon/crawler-analytics` reads edge + crawler data via `AnalyticsProvider`.
5. **Decide** — `@jeldon/strategy` joins all of the above into a deterministic,
   evidence-backed recommendation list.

## Host target

Consumers deploy on **Astro 5 + Cloudflare Workers**. Astro's official adapter
dropped Pages; the template bakes in the supported Workers adapter so every
consumer inherits a current config. Non-Cloudflare hosts run the ranking core on
`FsStore` + `NullAnalytics`.

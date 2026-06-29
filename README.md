# Jeldon Core

**A portable article + AEO/SEO + analytics engine.** Drop it into a new project
in any domain and it predictably engineers content that ranks in classic search
*and* gets cited by AI answer engines (ChatGPT, Perplexity, Google AI Overviews,
Claude).

Jeldon is the extracted, domain-agnostic engine behind a proven content-ranking
platform. The name riffs on Asimov's Hari Seldon — psychohistory, the science of
engineering predictable outcomes at scale — with the **J for Jason**. That's the
goal in a word: **predictable success** — ranking outcomes that are reproducible
across verticals, not bespoke every time.

## The one idea

```
Engine (invariant)  +  Domain Pack (the only thing you edit)  =  a ranking machine for your vertical
```

- **The engine** is a set of versioned `@jeldon/*` packages. It hardcodes nothing
  about any domain — every weight, regex, prompt, and brand string is a config
  input.
- **The Domain Pack** is one typed file, `jeldon.config.ts`. Brand, voice,
  scoring weights, citation policy, AEO query set, competitors, schema policy,
  and an opt-in compliance pack (so HIPAA-class rules are never baked in).

Filling that one file — validated by a JSON Schema, checked by `jeldon doctor`,
gated by CI — is the whole job. That is what makes a new site fast to stand up
and predictable to get right.

## Quick start (consumer project)

```bash
npx degit dryoung1029/jeldon/template my-site
cd my-site && pnpm install
# fill jeldon.config.ts — diff against examples/jeldon.config.example.ts
npx jeldon doctor --pre      # reports config + env gaps as a TODO list
# ...fill the gaps...
npx jeldon doctor            # all checks green = wired correctly
pnpm build
```

Full step-by-step (for humans or agents): [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md).

## What's in the box

**Ranking Core** (`@jeldon/{config, core-scoring, content-model, schema-graph,
store, aeo-audit, verify, strategy, cli}`) — scoring, content model, structured
data, persistence, the answer-engine citation-presence audit, citation
verification, the recommendations engine, and the CLI.

**Growth modules** (`@jeldon/{drafting, amplify, media, competitive-intel,
crawler-analytics, entity-presence}`) — AI drafting with voice injection,
amplification + newsletter, hero images + narration + podcast, the competitive
"War Room", crawler/edge analytics, and off-site entity-presence signals. Each
sits behind a capability flag.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for build status per package.

## Repo layout

```
packages/   the engine — published @jeldon/* packages
template/   the thin Astro + Cloudflare Workers starter consumers clone
docs/       agent-facing documentation
schemas/    JSON Schema source of truth (generated from the Zod schema)
```

## For AI coding agents

Start at [`AGENTS.md`](AGENTS.md), then [`docs/CONSTITUTION.md`](docs/CONSTITUTION.md).
The system is built so an agent can stand it up by following a runbook with
per-step acceptance criteria — not by reassembling loose source.

## License

UNLICENSED — private, proprietary. Not for redistribution.

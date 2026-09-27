---
"@jeldon/benchmark": minor
"@jeldon/cli": minor
---

**`@jeldon/benchmark`** — the standing directive, enforced. `snapshotSite(url)`
fetches home + sampled pages + sitemap + robots (+ PageSpeed when enabled) and
`analyzePage` extracts the same facts from both sites; `measureAll` scores ten
dimensions (speed, search hygiene, duplicate-intent URLs, structured data,
citability via `@jeldon/core-scoring`, content depth, conversion path,
accessibility, honesty, local) as higher-is-better numbers; `compare` yields
win / tie / behind / unmeasured with one rule; `buildScorecard` +
`renderScorecardMarkdown` produce the table, the three biggest wins in plain
words and the fix list; `captureBaseline` stores the OLD site on day one.
Injected fetchers make every dimension unit-testable without network.

**`jeldon init`** — the spawn. `jeldon init [dir] --kit local-business
--name … --url … --from <old site> --answers <file> --crm … --notify …`:
scrapes the old site with competitive-intel (title/description, NAP from
schema, phone, social links, logo, nav labels, every sitemap URL, blog posts
→ migrated drafts, booking/checkout vendors by host, GSC tag, template
vendor), stores `data/benchmark/baseline.json`, interviews (or reads
`--answers`; every scraped fact is "I found X — keep it?" and lands with a
`SETUP:` marker until confirmed), generates the pack from a per-vertical
scoring preset, the kit config, service/team/FAQ content, `_redirects` +
`OLD-URLS.md` from one redirect plan, the rendered agent kit, CI, README, and
verifies with `npm install` + validate + doctor + both builds. The answers
schema is published at `schemas/init-answers.schema.json`
(`@jeldon/cli/answers`); `examples/helix.answers.json` reproduces the Helix
reference consumer. **`jeldon benchmark`** — `--old <url> --new <url>`,
`--old <url>` (baseline only), `--ci` (compare NEW to the stored baseline;
exit 1 on any behind). Writes `data/benchmark/scorecard-<date>.md`,
`latest.json`, `baseline.json`.

---
description: Scan local competitors and report where {{businessName}} can win.
---

# /competitors — the competitive picture

Read `jeldon.config.ts → competitors`. The roster starts with what `jeldon init`
found; grow it.

## 1. Discover (WebSearch)

Search for {{competitorNoun}} that compete for the same person in {{city}} and nearby.
Use the `competitors.targetKeywords` in the pack as queries, plus Google Maps
result snippets. Skip the big chains unless the owner asks — different buyer.

For each real competitor with a website: add to `competitors.roster`
(`id`, `name`, `url`). Ask the owner to confirm the list once ("Anyone I'm
missing? Anyone to leave out?"). Commit.

## 2. Measure (deterministic)

Run `npm run competitors`. It writes `data/competitors/summary.md` and a JSON
per site: homepage citability (GEO) score, word count, headings, schema.org
types, sitemap/robots, template vendor, and a gap table against our site.
Read every summary. Also WebFetch each competitor's pricing page, schedule or
hours page, and one blog post if they have one; note prices, offers, and any
claims about credentials.

## 3. Interpret (you)

Write `data/competitors/report-<date>.md` with these sections, plain English:

- **Where we already win** (real findings only).
- **Where they beat us today** (real findings only: review counts, published
  schedules, clearer pricing).
- **Five moves, ranked by payoff ÷ effort.** Each: what, why, how long, which
  command does it (`/article`, `/audit`, a config change).
- **Article ideas the competitors aren't covering** — feed these to
  `data/reddit/ideas-<date>.md` too.
- **Local pack notes**: who shows in the Google map results for the target
  keywords and what their listings have that ours doesn't.

Never write anything that disparages a competitor by name in public content.
This report is internal.

## 4. Tell the owner

Three sentences: the single biggest thing we have that they don't, the single
biggest thing they have that we don't, and the first move. Link the report.
Ask if they want to start on move #1 now. Re-run quarterly; keep old reports.

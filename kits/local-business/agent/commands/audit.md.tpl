---
description: Find the weak spots on our own site — speed, SEO, structured data, links, accessibility, copy — and fix the easy ones.
---

# /audit — weak-spot check of our site

Two modes. Ask which, or do both if the owner says "everything".

## A. Live site audit (needs the `.workers.dev` or `{{siteHost}}` URL)

1. `npm run competitors -- <our live url>` — reuses the scanner on us:
   citability score, headings, schema types, sitemap, robots, page sample.
2. `npm run benchmark -- --old {{oldUrl}} --new <our live url>` — the ten
   dimensions, old vs new. Anything **behind** goes on the fix list first.
3. WebFetch the home page, one {{servicesSingularLower}} page, the schedule, pricing, contact,
   the {{blogLabelLower}} index, and the newest article. For each check:
   - Title 40–60 chars, unique; meta description 120–160 chars, unique.
   - Exactly one H1; H2s in order; no empty headings.
   - JSON-LD present and valid-looking (Organization/LocalBusiness on every
     page; Service on {{servicesPluralLower}}; Article + FAQPage on posts).
   - Every link resolves. Every image has alt text.
   - No `SETUP:` markers or placeholder text visible to a visitor.
   - Old URLs still redirect (spot-check five from `docs/OLD-URLS.md`).
4. Search Console, if they have exported CSVs: `npm run traffic`.

## B. Repo audit (no URL needed)

`npm run build`, `npm run check`, `npm run doctor`, `npm run check:frontmatter`,
`npm run check:geo`, `npm run check:citations`. Grep for `TODO`, `SETUP:`,
`lorem`, `example.com`. Check `public/_redirects` covers every URL in
`docs/OLD-URLS.md`.

## Report and fix

Write `data/audit-<date>.md`: a table of findings with **Severity** (blocks
launch / hurts ranking / cosmetic), **Page**, **What**, **Fix**, **Who**
(me now / owner decision / {{helperName}}). Then fix everything in the "me now"
column, build, commit "Audit fixes <date>", push, and re-check the fixed items live.

In chat: how many issues found, how many already fixed, and the one decision
the owner needs to make (if any). Keep it to five sentences.

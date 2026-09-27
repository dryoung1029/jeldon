---
description: Score the new site against the old one on every measurable dimension. The site launches only when it wins or ties on all of them.
---

# /benchmark — better than the old site, provably

The directive (CLAUDE.md): the new site must be better in every way that can be
measured and worse in none. This command produces the evidence.

Inputs: OLD = `{{oldUrl}}` (until launch; afterwards the archived copy if one
exists), NEW = the `.workers.dev` URL (or `https://{{siteHost}}` after launch).
If the new URL isn't in `docs/PROGRESS.md`, ask for it.

## Run it

```
npm run benchmark -- --old {{oldUrl}} --new <new url>
```

The engine (`@jeldon/benchmark`) measures both sites with the SAME method on
ten dimensions and writes `data/benchmark/scorecard-<date>.md` (human) and
`data/benchmark/latest.json` (machine). `jeldon init` stored the old site's
baseline in `data/benchmark/baseline.json` the day the project was created;
`npm run benchmark -- --ci` compares NEW to that baseline and exits 1 on any
**behind** — that is the CI gate and what `/launch` checks.

Dimensions: speed (PageSpeed, mobile + desktop, home + one {{servicesSingularLower}} page) ·
search hygiene · duplicate-intent URLs · structured data · citability (GEO) ·
content depth · conversion path · accessibility · honesty (unsourced stats,
expired promotions, stale copyright, placeholder text) · local (NAP, `tel:`,
map, confirmed hours).

## Read it, then act

Verdicts are **win / tie / behind**. Any **behind** blocks `/launch`. Under the
table the scorecard lists the three biggest wins in plain words (the owner can
quote these) and a fix list for anything behind or tied-that-could-win. Work
the fix list, re-run, and keep every scorecard; the trend matters.

In chat: the table, then one sentence.

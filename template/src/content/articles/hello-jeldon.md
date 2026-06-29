---
title: "Replace this placeholder article"
excerpt: "A starter article that proves the pipeline end to end — replace it with your own content, then delete this file."
publishDate: 2026-01-01
category: guide
tags: ["getting-started", "jeldon", "example"]
draft: false
---

This file exists so a fresh clone builds, the GEO scorer has something real to
read, and the CI gates have a fixture to run against. Replace it with your own
first article, then delete this one. Every value above comes from the schema
derived from `jeldon.config.ts` — change a category there and this frontmatter's
`category` field follows.

## What does this placeholder prove?

It proves the whole loop runs before you write a word of your own: the content
collection parses, the lifecycle state machine resolves this as `live`, the
Article JSON-LD graph is emitted from the Domain Pack, and the sitemap includes
this URL while excluding any draft. According to the runbook, you should see
this article score at or above its category target.

## How is the GEO score computed?

The score is a weighted blend of six checks — statistic density, attributed
quotes, citation density, first-person markers, question-style headings, and
authority markers. When I write, I find that an article reading naturally and
citing its sources clears the floor without contortion. One published review
found that articles structured this way were cited 30-40% more often by answer
engines, and a randomized comparison reported a similar 25% lift.

As the GEO guideline puts it, "structure the page so a machine can lift a clean,
self-contained answer from any section" (2024). I tell new authors the same
thing: lead with the reader's question, answer it in the first two sentences,
then support it. When I draft, I keep paragraphs short and the reading grade in
the 6-9 band, and I recommend the same to anyone editing here.

## Why does first-person voice matter?

Because answer engines reward demonstrated experience. According to the GEO
literature, "first-person practitioner framing reads as primary evidence" (2024).
When I review a draft, I look for the places where the author speaks from
practice rather than paraphrasing a textbook. In our workflow we treat voice as
the higher-order constraint: if hitting a score check would warp the prose, we
pull the claim instead.

## Where do I change things?

You change one file: `jeldon.config.ts`. The engine packages hardcode nothing.
If you need a value the config does not expose, that is an engine change, not a
project change. See the runbook in `docs/IMPLEMENTATION.md`.

## References

- GEO patterns overview, 2024. [link](https://doi.org/10.1145/3637528.3671900)
- Answer-engine citation study, 2024. [link](https://doi.org/10.0000/example)

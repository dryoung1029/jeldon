# AEO / GEO / SEO Playbook

What actually drives ranking and AI-answer citation, what generalizes across any
domain, and what is vertical-specific and therefore belongs in the Domain Pack —
not the engine.

## The portable ranking core (generalizes to any domain)

These are domain-general; the engine implements them, the pack tunes them.

1. **Statistic density.** Concrete numbers per 1k words. "responds in 6–12 weeks"
   beats "responds quickly" — measurably higher answer-engine citation rate
   (Princeton GEO 2024). Domain-general; only the magnitude band is tuned.
2. **Attributed direct quotes.** A quoted claim followed by attribution. The
   *attribution pattern* is config (PubMed "et al" vs "per the postmortem"), the
   value of the signal is universal.
3. **Citation density.** Links to primary sources per 1k words. The *sources*
   are domain-specific (PubMed/DOI vs RFC/CVE/case-law) → config patterns. The
   discipline is universal.
4. **First-person practitioner markers.** Answer engines weight content that
   reads as authored by a named expert over aggregated SEO prose. Marker phrases
   are config; the entity-authorship signal is universal.
5. **Question-shaped H2s.** Direct query→answer pairs; feeds FAQPage schema. The
   starter words are config; the pattern is universal.
6. **Front-loaded authority markers.** "according to X", named guidelines/standards.
   Patterns are config; the lift is universal.
7. **Structured-data graph.** Organization/Person/Article/FAQPage/Breadcrumb
   JSON-LD with `@id` consolidation for E-E-A-T. Generic by default; vertical
   types (`MedicalWebPage`, `TechArticle`) load from `schema.articleTypes`.
8. **Citation-presence measurement.** Auditing whether answer engines actually
   cite you (`@jeldon/aeo-audit`) — measures *outcome*, not proxy. Fully portable.

## When the score is maxed and you still aren't cited: extraction beats evidence

Body of Health, 2026-10-04: four target queries had zero citations across
three engines for six straight snapshots, while every target article already
scored GEO 85-100 with attributed quotes and real references. Adding more
evidence did nothing. The articles failed on extraction:

1. **Is the answer in sentences 1–3?** Their first sentences were narrative and
   the verdict sat under an H2. Put the direct answer first.
2. **Does the title or H1 contain the query's literal nouns?** "Back pain",
   "while pregnant", "how many visits" were missing. Change the title, keep the
   slug.
3. **Is there a structured block an engine can lift?** A decision table, a
   numbered list or a short definition, built only from facts already in the
   body.

The fixes were surgical and added no claims. Two caveats: a non-local query
competes with national authority sites and the Reddit threads engines cite, so
a local page may never win it; and fixing the lede can nudge SEO down a point or
two on the body-length check, which is not a ranking signal.

The AEO audit's "win the query" action items and the drafting prompts carry
this checklist.

## Vertical-specific → belongs in the Domain Pack, not the engine

- Citation **sources** (PubMed vs RFC vs SEC filings vs case law).
- Reading-grade band (health 6–9; technical 9–12; legal can be higher).
- Compliance behavior (HIPAA review-response rules, financial disclaimers) →
  `compliance.pack`, opt-in.
- Schema entity types (`Medical*`, `Legal*`, `Financial*`).
- Voice/persona, banned topics, banned phrasings.

## Explicitly demoted

- **`llms.txt`** — near-zero crawler adoption; Google does not consume it. Cheap
  to emit (`schema.emitLlmsTxt`), but never a ranking pillar. Prioritize correct
  `robots.txt` AI-crawler-allow hygiene instead.
- **Fixed GEO weights as gospel** — the Princeton findings are directional; the
  *efficacy of each lever varies by domain*. That is exactly why weights are
  config, not constants. Do not treat `[25,25,15,15,10,10]` as universal — it is
  the health-tuned default.

## The biggest lever the source system doesn't have yet

**Off-site entity presence.** Brand mentions across third-party sites (Reddit,
Wikipedia, industry forums, comparison pages) correlate ~3× stronger with AI
visibility than backlinks, and differ per engine (Reddit → Perplexity,
consensus/Wikipedia → ChatGPT, structured depth → Claude). On-page-only
optimization structurally cannot reach this. It is scoped as `@jeldon/entity-presence`
(v3) and is the highest-leverage growth investment once the core is in place.

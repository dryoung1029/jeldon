---
"@jeldon/drafting": minor
---

Generate consistent, in-band tags for every draft. The draft prompts now instruct
the model to choose tags from the pack's `content.tags` controlled vocabulary (or
free-form when none is set), targeting the SEO `scoring.seo.tags` band. A
deterministic `reconcileTags` pass runs in the draft loop before scoring: it keeps
the model's in-vocabulary choices, drops invented ones, backfills by relevance to
reach the band minimum, and clamps to the maximum — so the reported score reflects
the tags the article ships with, and the site taxonomy stays consistent for topic
clustering. Backfill tags come only from the curated vocabulary (no fabrication).
Exports `selectTags` and `reconcileTags`.

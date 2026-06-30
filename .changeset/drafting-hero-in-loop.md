---
"@jeldon/drafting": minor
---

Wire optional hero generation into the `draft()` loop. When `DraftDeps.hero`
(proposer + `ImageGen` + `ObjectStore`) is provided and the `heroImages`
capability is on, each finished draft — single and per series sibling — gets a
generated hero image + alt-text written into its frontmatter and is re-scored so
the reported SEO reflects it. Hero runs after the fix-pass (which rewrites
frontmatter and would otherwise clobber the fields). Omitting `hero` keeps hero
deferred past draft time (the unchanged default). Also: re-run `reconcileTags` on
fix-pass output (the fix-pass returns full frontmatter, so tags need reconciling
again), and export a pure `scoreContent` helper for cheap re-scoring.

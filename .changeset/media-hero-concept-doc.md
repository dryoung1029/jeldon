---
"@jeldon/media": patch
---

`proposeHeroConcept` is no longer described as a stub: its injected
`ConceptProposer` now has a ready adapter — `@jeldon/drafting`'s
`LlmConceptProposer` — so the doc comment points there and the `TODO(port)`
marker is removed. No behavior change.

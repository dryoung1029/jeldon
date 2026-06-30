---
"@jeldon/drafting": minor
---

Wire hero-image concept + alt-text generation. Adds `LlmConceptProposer`, the
`ConceptProposer` adapter over the package's `LlmProvider` that activates
`@jeldon/media`'s `proposeHeroConcept` (forces the `propose_image` tool, parses
the result) — the Anthropic round-trip media deliberately left to the drafting
layer. Also exports `proposeHero` (convenience over `proposeHeroConcept`),
`heroInputFromMarkdown` (build a `HeroConceptInput` from a draft), and
`setHeroAlt` (surgically write `heroImageAlt` into frontmatter). Internal
frontmatter helpers are consolidated into one `fm-lite` module so the tag and
hero post-processors don't each grow their own parser. Image-byte generation +
writing the `heroImage:` path is the follow-up.

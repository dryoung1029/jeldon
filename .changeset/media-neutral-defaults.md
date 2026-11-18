---
"@jeldon/media": minor
---

`buildPodcastFeed` throws, naming the missing `media.podcast.*` fields, when the channel's identity fields are blank (the new default). `synthesize` skips the outro when `outroText` is blank. `proposeHeroConcept` takes an optional fourth `brand` argument that fills the art-director prompt's `{BRAND}` / `{PERSONA}` slots; new exports `fillProposalSystem`, `heroBrandFromPack` and `HeroBrandContext`.

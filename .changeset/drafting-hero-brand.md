---
"@jeldon/drafting": minor
---

`proposeHero`, `generateHeroForDraft` and `DraftHeroDeps` accept a `brand` context for the hero art-director prompt. The draft loop fills it from `pack.brand.name` and `pack.voice.persona` when not given.

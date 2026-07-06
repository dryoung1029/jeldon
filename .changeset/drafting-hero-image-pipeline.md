---
"@jeldon/drafting": minor
---

Add `generateHeroForDraft` — the full hero pipeline for a drafted article:
propose a concept + alt-text, generate the image via `@jeldon/media`'s
`generateHeroImage`, persist the bytes, and write both `heroImage` (the public
path) and `heroImageAlt` into the draft's frontmatter — the two fields the SEO
scorer rewards. It is a deliberate no-op (content untouched, `changed: false`)
when the `heroImages` capability is off or no `ImageGen`/`ObjectStore` is wired,
so a host can call it unconditionally and let config decide. Also exports
`setHeroImage`.

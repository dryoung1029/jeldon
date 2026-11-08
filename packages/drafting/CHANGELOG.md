# @jeldon/drafting

## 0.2.0

### Minor Changes

- d64f69e: Wire hero-image concept + alt-text generation. Adds `LlmConceptProposer`, the
  `ConceptProposer` adapter over the package's `LlmProvider` that activates
  `@jeldon/media`'s `proposeHeroConcept` (forces the `propose_image` tool, parses
  the result) — the Anthropic round-trip media deliberately left to the drafting
  layer. Also exports `proposeHero` (convenience over `proposeHeroConcept`),
  `heroInputFromMarkdown` (build a `HeroConceptInput` from a draft), and
  `setHeroAlt` (surgically write `heroImageAlt` into frontmatter). Internal
  frontmatter helpers are consolidated into one `fm-lite` module so the tag and
  hero post-processors don't each grow their own parser. Image-byte generation +
  writing the `heroImage:` path is the follow-up.
- 65e0741: Add `generateHeroForDraft` — the full hero pipeline for a drafted article:
  propose a concept + alt-text, generate the image via `@jeldon/media`'s
  `generateHeroImage`, persist the bytes, and write both `heroImage` (the public
  path) and `heroImageAlt` into the draft's frontmatter — the two fields the SEO
  scorer rewards. It is a deliberate no-op (content untouched, `changed: false`)
  when the `heroImages` capability is off or no `ImageGen`/`ObjectStore` is wired,
  so a host can call it unconditionally and let config decide. Also exports
  `setHeroImage`.
- 7993c30: Wire optional hero generation into the `draft()` loop. When `DraftDeps.hero`
  (proposer + `ImageGen` + `ObjectStore`) is provided and the `heroImages`
  capability is on, each finished draft — single and per series sibling — gets a
  generated hero image + alt-text written into its frontmatter and is re-scored so
  the reported SEO reflects it. Hero runs after the fix-pass (which rewrites
  frontmatter and would otherwise clobber the fields). Omitting `hero` keeps hero
  deferred past draft time (the unchanged default). Also: re-run `reconcileTags` on
  fix-pass output (the fix-pass returns full frontmatter, so tags need reconciling
  again), and export a pure `scoreContent` helper for cheap re-scoring.
- 6edca9e: Generate consistent, in-band tags for every draft. The draft prompts now instruct
  the model to choose tags from the pack's `content.tags` controlled vocabulary (or
  free-form when none is set), targeting the SEO `scoring.seo.tags` band. A
  deterministic `reconcileTags` pass runs in the draft loop before scoring: it keeps
  the model's in-vocabulary choices, drops invented ones, backfills by relevance to
  reach the band minimum, and clamps to the maximum — so the reported score reflects
  the tags the article ships with, and the site taxonomy stays consistent for topic
  clustering. Backfill tags come only from the curated vocabulary (no fabrication).
  Exports `selectTags` and `reconcileTags`.

### Patch Changes

- 90ade5c: Bump the `tsup` build-tool devDependency from 8.3 to 9.x across every engine
  package (one major version). No public API or build-output-format change for
  this simple `--format esm --dts --clean` usage; verified with a clean
  build + typecheck across all 15 packages. Part of a security/platform audit
  pass — tsup 9's bundled esbuild (^0.28.2) clears the low-severity
  GHSA-g7r4-m6w7-qqqr advisory flagged by `pnpm audit`.
- b653b6e: Bump the `vitest` test-runner devDependency from 2.1 to 5.1 (three major
  versions) across every engine package, with an explicit `vite@^8.3.6`
  devDependency to satisfy vitest 5's peer requirement (vitest 5 needs vite's
  `./module-runner` export, not present before vite 6.4). No test file changes
  were needed — this workspace uses plain `describe`/`it`/`expect`, no
  `vi.mock`/`vi.hoisted`/`mockReset`, no config file, no `@vitest/ui`. Verified
  with a full `pnpm build` + `typecheck` + `test` pass (15/15, 21/21, 21/21).

  Clears 21 of the 26 `pnpm audit` findings from a security/platform audit pass
  — every critical, moderate, and low-severity advisory in the dev/build
  toolchain (vite, vitest, @vitest/mocker, tinypool, esbuild, postcss,
  source-map-js), including two critical prototype-pollution-to-RCE advisories
  in `tinypool`.

- Updated dependencies [90ade5c]
- Updated dependencies [b653b6e]
- Updated dependencies [7eda101]
- Updated dependencies [d64f69e]
- Updated dependencies [d9cd81b]
  - @jeldon/config@0.2.0
  - @jeldon/core-scoring@0.1.1
  - @jeldon/store@0.1.1
  - @jeldon/verify@0.1.1
  - @jeldon/media@0.1.1

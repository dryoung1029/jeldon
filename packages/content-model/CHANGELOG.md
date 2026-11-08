# @jeldon/content-model

## 0.1.1

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

- d9cd81b: Migrate from zod 3.25 to zod 4.6 (one major version) — the keystone dependency
  every `@jeldon/*` package relies on through `@jeldon/config`'s inferred types.

  Code changes (mechanical, no behavior change):

  - 10 single-argument `z.record(V)` calls → the v4-required two-argument
    `z.record(z.string(), V)` form (`categoryTargets`, `brandColors`,
    `nap`, `models`, `promptOverrides`, `affinity`, `deepLinks`, `copy`, and
    the two `extra` passthrough fields).
  - `z.string().url()` → the top-level `z.url()` (3 call sites: `brand.siteUrl`,
    `schema.org.url`, `content-model`'s `sourceEpisode`).
  - `z.ZodIssueCode.custom` → the plain string literal `'custom'` in the three
    `superRefine` cross-field checks (GEO floor vs. category targets, orphaned
    `categoryTargets` keys, `defaultAuthorSlug` match).

  Also: `scripts/gen-schema.mjs` now uses zod v4's built-in `z.toJSONSchema()`
  instead of the third-party `zod-to-json-schema` package, whose zod-v4 support
  was unconfirmed. The generated `schemas/domain-pack.schema.json` is a flatter,
  more standard draft-2020-12 document (no artificial top-level `$ref`
  wrapper); `content.tags`, URL fields (`format: "uri"`), and record fields
  (`propertyNames` + `additionalProperties`) all render correctly.

  Verified empirically, not just by type-checking: `loadDomainPack`/
  `validateDomainPack` against both template configs, plus all three
  `superRefine` cross-field checks individually triggered — identical error
  paths and messages to the pre-migration behavior. Full `jeldon validate` /
  `doctor --pre` / `check-geo-floor` smoke test against a fixture project
  produces byte-identical output to before the migration. Full workspace
  `build` (15/15) + `typecheck` (21/21) + `test` (21/21) green throughout.

  Resolves the one non-dev-toolchain `pnpm audit` finding from a
  security/platform audit pass (GHSA-mrhx-c7xc-m3w5) — almost certainly a false
  positive against zod 3.x (the advisory's own internals, `$ZodArray`, don't
  exist in 3.x), but moving to 4.6.7 removes the ambiguity rather than leaving
  it unresolved.

- Updated dependencies [90ade5c]
- Updated dependencies [b653b6e]
- Updated dependencies [7eda101]
- Updated dependencies [d9cd81b]
  - @jeldon/config@0.2.0

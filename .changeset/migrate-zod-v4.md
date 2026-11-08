---
"@jeldon/config": patch
"@jeldon/content-model": patch
---

Migrate from zod 3.25 to zod 4.6 (one major version) — the keystone dependency
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

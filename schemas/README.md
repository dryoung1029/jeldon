# schemas/

JSON Schema source of truth for Jeldon config files. **Generated, do not edit by
hand.**

```bash
pnpm build          # build @jeldon/config first
pnpm gen:schema     # writes domain-pack.schema.json from the Zod schema
```

Consumer configs can reference the generated schema (via a `$schema` key on a
JSON variant, or through the TypeScript types in `@jeldon/config`) to get
editor autocomplete and structural validation — invalid structure becomes
impossible to author, not merely detectable at runtime.

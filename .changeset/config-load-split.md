---
"@jeldon/config": minor
"@jeldon/cli": patch
---

Split `@jeldon/config` into two entry points. The root (`@jeldon/config`) is
isomorphic — types, the Zod schema, defaults, `validateDomainPack`,
`defineDomainPack`, and the new pure URL helpers — with no `node:*` or jiti
in its static import graph, so a Cloudflare Worker route can import it
without dragging the filesystem loader into the bundle (Helix finding #8).
The loader (`loadDomainPack`, `resolveConfigPath`) moves to
`@jeldon/config/load`. The root keeps a `loadDomainPack` shim that defers to
`./load` through a dynamic import; it is deprecated and is removed in 0.3.
A test greps the built dist to prove the root graph is `node:`-free. The CLI
imports the loader from `@jeldon/config/load`.

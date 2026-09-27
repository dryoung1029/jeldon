---
"@jeldon/kit-local-business": minor
"@jeldon/competitive-intel": patch
---

New package `@jeldon/kit-local-business` — the Local Business Kit extracted
from the Helix Training build and generalized. Isomorphic root: `KitConfig`
(+ Zod schema, `defineKitConfig`), vocabulary presets (`gym`, `clinic`,
`studio`, `shop`, `generic`) with `resolveLabels`, per-vertical scoring presets,
design tokens from `brand.brandColors` + `brand.fonts` (`buildGlobalCss`,
derived shades, light/dark), `openingHoursSpec`, the contact handler
(`handleContact` / `processContact`) with `LeadSink` adapters (pushpress,
gohighlevel, brevo-contact, none) and `Notifier` adapters (brevo, resend,
none), the PushPress adapter, booking adapters + vendor recognition, the
redirect generator (`planRedirects` → `_redirects` + `OLD-URLS.md` from one
plan), `serviceNode`, and `complianceCopy` — the one place the kit reads the
compliance pack. Node entry (`/node`): `loadKitConfig`, `kitChecks()` for the
doctor registry, `sendTestContact`, `buildTrafficReport`. The Astro overlay
lives in `kits/local-business/` (neutral page set, label-driven copy, content
collections for services/team/faqs, the contact route, CI + nightly rebuild,
workbench scripts) with the agent-kit templates under `kits/local-business/agent/`.
`competitive-intel` exports `listSitemapUrls`.

# Migration

How engine changes reach consumer projects, and how to apply breaking changes.

## Routine updates (no action)

Package version bumps ride **Renovate** (config shipped in the template). A new
`@jeldon/*` release opens an auto-update PR in every consumer repo; it
auto-merges on green CI. Most updates need nothing from you.

## Scaffold/template updates

Changes to template-owned files (configs, CI workflows, `AGENTS.md`) propagate
via `copier update`, which re-merges upstream template diffs into an existing
project and opens a PR. Resolve any conflicts the same way you would a rebase.

## Breaking changes (codemods)

Structural changes across a major version ship as codemods:

```bash
npx jeldon migrate            # detects current engine version, applies the chain
npx jeldon migrate --to 2.0   # target a specific version
```

Each codemod is idempotent and prints a summary of files touched. Review the
diff, run `jeldon doctor`, and confirm CI is green before merging.

## Manual migrations

`jeldon migrate` is not built yet. Until it is, these changes need a hand edit;
`jeldon validate` names each one.

### `analytics.refererChannelMap`: `needles` → `hosts` (0.3)

Substring needles misclassified referers (`t.co` matched reddit.com, chatgpt.com
and pinterest.com). Each rule now takes:

| Old | New |
|---|---|
| `needles: ['reddit']` | `hosts: ['reddit.com', 'redd.it']` |
| `needles: ['google.']` | `hostPatterns: ['(^\|\\.)google\\.']` |
| `needles: ['newsletter', 'fb']` (UTM tokens) | `utmSources: ['newsletter', 'fb']` |
| `needles: ['yoursite.com'], drop: true` | delete it: `brand.siteUrl` is dropped automatically (add others to `ownHosts`) |

If you never set `analytics`, nothing changes: the defaults were rewritten.

`strategy.refererGroups` entries are now exact channel labels (`'Google Search'`),
not substrings (`'google'`).

### Template: Pages → Workers config, Astro 5.18 (template 2026-11)

The template now pins `astro ^5.18.0`, `@astrojs/cloudflare ^12.6.13`,
`wrangler ^4.59.2` and `engines.node >=22.18` (the repo root's floor).
`wrangler.toml` drops `pages_build_output_dir` for a Workers config:

```toml
main = "./dist/_worker.js/index.js"
[assets]
binding = "ASSETS"
directory = "./dist"
```

plus `public/.assetsignore` (`_worker.js`, `_routes.json`). Existing projects:
copy those three changes, then deploy with `wrangler deploy`, not Pages git
builds. Verified 2026-11-17: the template installs and `astro build` passes on
Node 22.23 / astro 5.18.2, and `wrangler dev` serves the built worker.

### Astro 6 / 7 upgrade findings (not applied yet)

Recorded from upgrade research for the Body of Health site; not yet exercised
on this template, which is still on 5. Confirm each against the upgrade guide
when you do it. What will need doing:

- **`@astrojs/cloudflare` v13+ dropped Pages.** Workers only. The template is
  already on a Workers config, so this is a version bump there; a project still
  on Pages must move first (section above).
- **Env moves off `locals.runtime.env`** (to the Workers runtime's own env
  import). In the template that touches `src/middleware.ts` (the `CF_ACCESS_*`
  override read) and any API route that reads secrets.
- **Legacy content collections are removed.** `src/content/config.ts` becomes
  `src/content.config.ts` with a `glob()` loader
  (`loader: glob({ pattern: '**/*.md', base: './src/content/articles' })`);
  `entry.slug` becomes `entry.id`; `entry.render()` becomes
  `import { render } from 'astro:content'; await render(entry)`.
- **Astro 7 markdown:** rendering markdown outside content collections needs
  `unified({ remarkPlugins })` from `@astrojs/markdown-remark`.
- **Astro 7 needs Node 22+.** Already the floor (`>=22.18`).

## Versioning

The engine uses **Changesets**. Every change to a `@jeldon/*` package ships with
a changeset describing the bump (patch/minor/major). Major bumps that require a
codemod link the codemod in their changelog entry.

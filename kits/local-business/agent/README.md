# Agent kit templates

`jeldon init` renders these into a consumer repo: `CLAUDE.md`, `.claude/commands/*.md`
and `docs/*.md`. Syntax is deliberately tiny (see `@jeldon/cli` `render.ts`):

- `{{name}}` — substitute a variable (HTML-unescaped, plain text)
- `{{#if name}} … {{/if}}` — include when the variable is truthy
- `{{#unless name}} … {{/unless}}` — include when falsy
- `{{#eq name "value"}} … {{/eq}}` — include when equal

Variables come from the init answers + kit labels (`buildAgentVars()`). Rules
that must survive in every render, whatever the vertical: the owner never uses
a terminal; secrets never in chat or repo; articles are drafts until approved;
no invented business facts (`SETUP:` markers until confirmed); every reference
link opened before publishing; DNS is a two-person step with a named helper;
click-paths are best-known maps; `/benchmark` gates `/launch`.

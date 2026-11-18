---
"@jeldon/ops": minor
"@jeldon/config": minor
"@jeldon/cli": minor
---

New `@jeldon/ops` package: pipeline freshness, the needs-attention feed, and on-demand workflow dispatch.

- `pipelineStatus` / `gradePipelines` grade each cron-fed file ok / late / stale / never against its cadence (multipliers from `ops.grading`, default 1.5× / 3×). Change-gated files (rewritten only on change) are graded on a `checkedAt` stamp read from the same file, so the proof comes from the step that owns it. A change-gated file without `checkedAt`, an unparseable timestamp or an unreadable file is `unattestable` with a reason, never `ok`.
- `buildAttention` merges injected producers into one bad → warn → info list; a producer that throws becomes a `bad` item instead of silence. Producer helpers for stale pipelines, cadence ("no article published in N days", newsletter only when `ops.cadence.newsletterDays` is set), unreviewed autonomous drafts, live articles missing a hero image (drafts excluded), stuck/errored newsletters and read failures.
- `createActionsClient` (injected `fetch`) dispatches and reads workflow runs; off-allowlist workflows throw before any request, and 403/404 errors name the fix (fine-grained token needs "Actions: Read and write"). `findRunAfter` ignores the run read before dispatching and any run created before the click minus `createdAtSlackSeconds`; `dispatchAndWait` polls to done / failed / timeout / error.
- `skipWithWarning(name, missing)` prints a GitHub `::warning::` line for crons that skip on missing secrets.
- `@jeldon/config`: new optional `ops` section (`pipelines`, `grading`, `cadence`, `dispatch`, `links`), `defaultOpsConfig`, `defaultOpsDispatchTiming`, and the `capabilities.ops` flag. The schema rejects a pipeline whose `run.workflow` is not in `ops.dispatch.allowlist`.
- `@jeldon/cli`: with `capabilities.ops`, `jeldon doctor` checks that every allowlisted workflow exists under `.github/workflows/` and warns that the dispatch token needs "Actions: Read and write" (not verifiable offline).
- Template: `.github/actions/commit-and-push` (commit on change, push with up to 3 `git pull --rebase` retries) and `docs/accuracy-audit-prompt.md`.

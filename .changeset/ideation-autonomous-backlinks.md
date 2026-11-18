---
"@jeldon/ideation": minor
"@jeldon/drafting": minor
"@jeldon/verify": minor
"@jeldon/config": minor
---

Port Body of Health section 7 (drafting and ideation).

- New `@jeldon/ideation`:
  - `mineTranscript()` mines a published recording (through a `TranscriptFetcher`; `YoutubeTranscriptFetcher` ships) or a pasted / video-editor transcript. A private recording gets a SOURCE MATERIAL block (no listen callout, off-the-cuff statements are not citations) instead of the cross-promotion block. `sourceTimestampStart` is required by the tool schema only when the source has `[m:ss]` anchors, and timestamps a model returns for an un-anchored source are stripped. 200 000-char cap and 400-char floor; a failed URL fetch returns before any model call.
  - `runRedditRadar()` is read-only listening (GET to reddit.com only; JSON then RSS with 429 backoff inside a retry budget; an all-failed run keeps the previous snapshot). Brand terms are word-bounded with per-term generic-phrase exclusions; competitor names come from `competitors.roster`. `scoreRedditTargets()` ranks engine-cited threads (from the AEO snapshot's `redditCitations`) first, applies recency bands, and turns threads past `archivedAfterDays` into "out-publish it" actions. `proposeRedditBriefs()` builds briefs with the listening-only and never-retell-a-thread rules.
  - The topic backlog is one exported Zod schema, `topicEntrySchema`, used by both reader and writer. Unknown fields survive a save, a malformed backlog file is never overwritten, and invalid stored entries are kept.
- `@jeldon/drafting`: `runAutonomousDrafts()` drafts from a research digest through the existing `draft()` loop, writes `draft: true` + `autonomous: true` (never publishes, never overwrites an existing slug), caps drafts per run and reports leftovers. `proposeBacklinks()` / `applyBacklinks()` port the backlink finder: chunked candidates (default 8), malformed proposals dropped and counted, typography-tolerant anchor matching that returns the original substring, ambiguity rejected at propose and at apply. The `draft()` result event now carries `verification`.
- `@jeldon/verify`: `ResearchDigestSource` contract, `Cite8DigestSource` and `NullDigestSource`.
- `@jeldon/config`: optional `ideation`, `listening`, `drafting.autonomous`, `drafting.backlinks` sections with generic defaults, and capability flags `ideation` and `listening`.

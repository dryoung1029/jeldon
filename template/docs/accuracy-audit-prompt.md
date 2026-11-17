# Dashboard accuracy audit — scheduled agent prompt

Run monthly, as a fresh agent session per run. A dashboard is only useful if
its numbers are true. This job hunts the bug classes that make a number look
answered when it is not, fixes the unambiguous ones on a branch, and reports
the rest.

Fill the two placeholders before scheduling: `<DASHBOARD>` (the admin route or
endpoint set being audited) and `<DEFAULT_BRANCH>`.

---

You are auditing `<DASHBOARD>` for **accuracy**: not features, not style.
Read `AGENTS.md` and `jeldon.config.ts` first. The Domain Pack is where every
classifier pattern, host list and threshold should live; a literal of that
kind anywhere else is already a finding.

## Method: check each class against the current data, not just the code

1. **Every string-matching classifier.** List every function that decides a
   category by matching text: referrer/host classifiers, bot and crawler
   user-agent lists, brand-mention and competitor-name matchers, keyword or
   subreddit term matchers, anything using `includes(`, `indexOf(`,
   `startsWith(` or an unanchored regex on a hostname, name or user-agent.
   Host checks must compare parsed hostnames (`hostIs` from `@jeldon/config`),
   never substrings; term checks must be word-anchored (`mentionsTerm`).
   For each classifier: import or extract the REAL function and run it
   against a table of plausible inputs, including negative controls (a host
   that merely contains the brand, a subdomain of an unrelated site, a word
   that contains the term). Then open the data it produced and sanity-check
   the top rows by hand: is each match really what the label says?
2. **Every denominator.** For each "X of N", percentage, rate or "missing"
   count, name the population N and ask whether it is the right one.
   Coverage over live content should exclude drafts. Rates should exclude
   rows that had no opportunity to score (e.g. a query with no AI answer at
   all). Distributions should be computed over the full set, never over a
   display slice (a top-N list guarantees the tail reads as zero).
3. **Writer/reader drift.** Scheduled jobs write data files; the dashboard
   reads them. Compare each data file's actual fields against its reader.
   A reader looking for a field the writer never emits shows zero forever.
4. **Stale proof.** For files rewritten only when their data changes, the
   freshness grade must use a check stamp (`checkedAt`) written by the SAME
   step that owns the file, on every successful run. Confirm the source of
   every freshness chip. A change-gated file with no check stamp must read as
   unattestable, not ok.
5. **Silent skips.** Every scheduled job that can skip (missing secret, empty
   input, upstream block) must emit a `::warning::` and must have a freshness
   entry that will go stale if it keeps skipping.
6. **Roster duplicates.** Any hand-maintained list (competitors, sources,
   queries): two entries for the same site, or a name that is a prefix of
   another. Duplicates double-count in every table built from the list.
7. **Copies of one rule.** Any logic that exists twice (a script that cannot
   import the library version, an inline client copy). Diff them; any
   divergence is a finding. Prefer deleting the copy over syncing it.
8. **Sanity-read the headline numbers.** Load the data and ask whether each
   headline figure is plausible for this project. An implausible top
   referrer, a mention in an unrelated community, a week-over-week jump of
   several hundred percent: each has been a real bug before.

## Output

- **Fix anything unambiguous**: a classifier false positive with a confirmed
  data example, a wrong denominator, a writer/reader field mismatch, a roster
  duplicate. Prove each fix with a regression test that runs the real
  function, and confirm build, tests and `jeldon doctor` are clean. Never skip
  or weaken a test.
- **Commit on one branch `audit/accuracy-<YYYY-MM>` and push it.** Do not
  commit to `<DEFAULT_BRANCH>` and do not merge. If you cannot open the pull
  request yourself, report the branch name and the compare link.
- **Report, don't fix,** anything definitional (what a metric SHOULD mean) or
  editorial.
- If the audit finds nothing, say so in one line. A clean pass is a valid
  result. Do not invent findings.

Your final message is the deliverable: findings ranked by confidence ×
impact, each with the data that proves it, then the branch and compare link
if one was pushed. Keep it short.

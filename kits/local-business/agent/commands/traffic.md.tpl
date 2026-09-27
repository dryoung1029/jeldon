---
description: Read Search Console (and Cloudflare Web Analytics) numbers and say what to do about them in plain words.
---

# /traffic — what the numbers say

## Getting the data (owner, ~3 minutes, no API)

Say this, then wait:

> 1. Open search.google.com/search-console and pick `{{siteHost}}`.
> 2. Left menu → **Performance** → **Search results**.
> 3. Top right, set the date range to **Last 3 months**.
> 4. Click **Export** (top right) → **Download CSV**. It saves a zip.
> 5. Unzip it. Then on github.com, open your repository → folder `data` →
>    `search-console` → **Add file** → **Upload files** → drag in the CSVs
>    (Queries, Pages, Dates, Devices) → **Commit changes**.
> 6. Tell me "uploaded".

Cloudflare Web Analytics has no export; ask them to read you three numbers from
Cloudflare → Analytics & Logs → Web Analytics (last 30 days): **visits**,
**page views**, and the **top 3 pages**. Note them in the report.

## Running it

`git pull`, then `npm run traffic`. Read `data/search-console/report.md`
(built by the engine's Search Console parser; the "Opportunities" list is
queries with impressions but a weak position or click-through rate).

## Interpreting (write `data/search-console/report-<date>.md`)

Plain English, five short sections:

1. **Headline**: clicks and impressions this period vs. the last file if one
   exists (trend, not just numbers).
2. **What people search to find us** — the top queries, grouped: brand,
   local intent, and questions.
3. **Pages doing the work** and pages getting impressions but few clicks
   (rewrite the title/description: name the fix).
4. **Opportunities**: queries at positions 8–20 with real impressions — each
   gets one recommended action (`/article` topic, or strengthen a page).
5. **Do this next** — one thing.

Then, in chat, the headline plus the one thing. Offer to do it.

Never claim a cause you can't see in the data. Say what changed and what you'd try.

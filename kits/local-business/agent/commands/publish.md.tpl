---
description: Publish an approved draft article (flip draft to false, re-check, push live).
---

# /publish — make an approved article live

Usage: `/publish <slug>` (the file name without `.md`). If no slug, list the
drafts in `{{contentDirArticles}}/` and ask which one.

1. Confirm in one line: "Publishing **<title>**. You've read the final version
   and it sounds like you — right?" Wait for yes. This is the owner's approval;
   nothing else counts.
2. Set `draft: false` and `publishDate` to today. If they want it out on a later
   date, leave it a draft and note the date in `docs/PROGRESS.md`; someone runs
   `/publish` that day.
3. Run `npm run check:frontmatter`, `npm run check:citations`, `npm run check:geo
   -- <file>`. All must pass. Open every reference link once more.
4. If the article has no `heroImage`, ask once whether they want one of their
   photos on it (name three from `public/photos/`). Add alt text if used.
5. `npm run build`. Commit "Publish: <title>". Push to `main`.
6. Tell them: "Live in about a minute at `https://{{siteHost}}{{routeBlog}}<slug>/`."
   After ~90 seconds, WebFetch the live URL to confirm it's up, then say so.
7. Add the URL to `jeldon.config.ts → voice.voiceAnchorUrls` if they said it
   sounds like them and there are fewer than 2 anchors. Commit.
8. Suggest one thing, not five: share it on social with the excerpt as the
   caption, or add an internal link to it from a related {{servicesSingularLower}} page.

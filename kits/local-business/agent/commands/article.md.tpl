---
description: Write a new {{blogLabelLower}} article in the owner's voice — researched, sourced, scored by the content engine, saved as a draft for their review.
---

# /article — draft a {{blogLabelLower}} post

Read `CLAUDE.md` and `docs/VOICE-SAMPLES.md` if it exists. Then run:

```
npm run brief -- <topic>
```

That prints **the drafting brief** — the owner's voice block, the GEO playbook,
the citation rules, the tag vocabulary and the exact frontmatter shape — built
from `jeldon.config.ts` by the engine. It is the same set of rules the engine's
own drafting pipeline uses. Follow it exactly; do not keep a private copy of
those rules in this file. The output is a Markdown file in
`{{contentDirArticles}}/` with `draft: true`. Only `/publish` makes it live.

## 1. Pick the topic (with the owner, briefly)

If they gave a topic in the command (`/article <topic>`), use it. Otherwise offer
three from `data/reddit/ideas-*.md` (newest) or, if none, three you propose from
`aeo.querySet` and `content.tags` in `jeldon.config.ts`. One message, three
bullets, "which one, or something else?"

Then ask exactly two questions:
1. "What do you actually tell people about this?" (their real take — this is
   what makes it theirs)
2. "Anything you want to make sure is in it, or kept out?"

## 2. Research (you, silently)

- WebSearch the topic. Prefer primary sources ({{sourcesHint}}). Aim for 3–5 references.
- Open each source with WebFetch and note the specific finding you'll cite,
  with numbers where they exist. If a source doesn't say it, don't cite it.
- Check what the top three ranking pages for the query do, so the article can
  be clearly better: more specific, more local, more honest, more useful.

## 3. Write it

Follow the brief. Two internal links (`{{routeServices}}…`, `{{routePrimaryCta}}`, `{{routeFaq}}`, another
`{{routeBlog}}…`). One plain next step at the end. General-education framing.
{{#if hipaa}}No diagnosis, no "cure", no individualized medical advice, no PHI.{{/if}}

## 4. Verify and score (you)

```
npm run check:frontmatter -- {{contentDirArticles}}/<slug>.md
npm run check:citations   -- {{contentDirArticles}}/<slug>.md
npm run score             -- {{contentDirArticles}}/<slug>.md
```
Read the `meh`/`bad` rows. If AI-citation readiness is below the category
target, improve the weak check **without** flattening the voice — add a real
statistic, a question heading, a first-person line. If a fix would make it sound
like a textbook, leave the score where it is and say so.

Re-open every reference link one more time. Confirm each says what the article
says it says.

## 5. Hand it over

Commit the draft ("Draft: <title>"). Then, in chat:

- The title and excerpt.
- The full article text (so they can read it right here — they may be on a phone).
- The three-line scorecard from `npm run score` in plain words.
- "Read it like a {{clientSingular}} would. Tell me anything that doesn't sound like you
  and I'll change it. When it's right, type `/publish <slug>`."

Apply edits as conversation ("make the second section shorter"). Each round:
edit, re-score, show the changed part only.

## Never

- Never publish. Never set `draft: false` here.
- Never cite a source you haven't opened.
- Never invent a {{clientSingular}} story. General framing only, unless they give you a
  real one and say it's okay to use.
- Never name a competitor critically.

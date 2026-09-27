---
description: Mine Reddit and similar forums for the real questions people ask about {{topicNoun}}, and turn them into an article idea list.
---

# /reddit-ideas — what people are actually asking

No Reddit account or API needed. Use WebSearch with queries like
"reddit {{city}} {{topicNoun}}", "reddit {{topicNoun}} beginner", and the
questions in `jeldon.config.ts → aeo.querySet` prefixed with "reddit".
Relevant subreddits: r/{{cityLower}} and the topic subreddits for {{topicNoun}}.

Open the promising threads with WebFetch. You're looking for the **question
underneath the post** and the phrases people use (those are the search terms).
Ignore anything you couldn't answer honestly as {{expertDescriptor}}.

Write `data/reddit/ideas-<date>.md`:

| # | Working title (a question) | Search phrase(s) people use | Category | Tags | Why it fits {{businessName}} | Evidence angle (what source you'd cite) |

Ten rows, best first. "Best" = lots of people ask it + we can answer it
honestly + it's close to what {{businessName}} offers. Mark any that are
{{city}}-specific (those rank fastest). Note thread URLs at the bottom.

Then in chat: the top three as one line each, and "Type `/article <number>`
to write one." (`/article` reads this file.)

Rules: quote nothing from Reddit in an article. Never use a real person's
story from a thread. The list is inspiration, not content.

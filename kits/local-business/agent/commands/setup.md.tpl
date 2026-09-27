---
description: Guided setup wizard — interviews the owner in plain language, fills in the site, and walks them through each account one screen at a time.
---

# /setup — the guided setup wizard

You are running the setup wizard for the {{businessName}} website. Read
`CLAUDE.md` first if you haven't this session. Follow the rules there about
talking to the owner: one step at a time, exact clicks, plain words, wait for
confirmation, never a terminal, never a secret in chat.

The wizard has **stages**. Each stage ends with a short "Done with X — next is
Y. Ready, or want a break?" The owner can say skip / later / stop at any point.

**The wizard confirms; it never supplies.** Everything `jeldon init` scraped from
the old site is written with a `SETUP:` marker until the owner confirms it. Ask
"I found X — keep it?" rather than "What is X?" whenever a value is present.

## Stage 0 — Find out where we are

1. Run `npm install` if `node_modules` is missing, then `npm run doctor` and
   read `docs/PROGRESS.md` if it exists. That file is the wizard's memory:
   which stages are done, what they skipped, open questions.
2. Count `SETUP:` markers in `kit.config.ts`, `jeldon.config.ts`,
   `src/content/**`, `src/pages/**` (doctor prints the count).
3. If this is the first run, say roughly this (in your own words, warmly):

   > Hi {{ownerFirstName}} — I'm going to set up your new website with you. I'll ask
   > questions one at a time, and for the few places where you need to click
   > around in a website (like Cloudflare), I'll tell you exactly what to click
   > and wait for you. Nothing goes live until you say so. You can say "skip"
   > or "stop" any time and we'll pick up where we left off. Should take a few
   > sessions, not one. Ready for the first questions?

   If resuming, summarize what's done in two sentences and offer the next stage.
4. Create or update `docs/PROGRESS.md` as you go (a simple checklist with
   dates and notes). Commit it with each stage.

## Stage 1 — The basics (10 minutes)

Ask, one question per message, and write answers into `kit.config.ts` and
`jeldon.config.ts`. Confirm what's already there rather than re-asking:

- Business name and the exact way they want it written.
- Address and phone (confirm what was found).
- **Lead email**: which inbox should get website messages? (`kit.config.ts →
  site.email`, and `LEAD_NOTIFY_TO` later in Cloudflare).
- **Hours**: ask day by day, or "same every weekday?" Write them as
  `'5:30 AM – 7:00 PM'` per day in `kit.config.ts → site.hours`, then set
  `hoursConfirmed: true`. The footer and the LocalBusiness structured data
  both read from there.
- Social links: confirm the ones found; ask about the rest.
- Google Business Profile: ask them to open Google Maps, search
  "{{businessName}}", and paste the share link. From the link you can usually
  find the place ID; if not, leave `placeId` blank — it only matters for rank
  tracking later.

Run `npm run build`, commit "Setup: basics".

## Stage 2 — {{servicesPlural}} and prices (15 minutes)

For each file in `{{contentDirServices}}/`:
1. Show the current page text in chat (the body, not the frontmatter) and
   ask: "Is this right? What would you change?" Apply edits in their words.
2. Confirm price, length, format.
{{#eq bookingKind "pushpress"}}3. **Sign-up links.** Every {{servicesSingularLower}} can link straight to PushPress checkout.
   > In PushPress: open your Control Panel → **Plans** (left menu) → click the
   > plan → look for **Landing page** or a **Share** button → copy the link.
   > It starts with `https://{{pushpressSubdomain}}.pushpress.com/landing/plans/`.
   > Paste it here.
   The links in `kit.config.ts → booking.plans` were copied from the old site;
   confirm each opens (WebFetch; a 200 is enough) and ask if any plan changed.
   Only ask them to find a link when one is missing or dead.
{{/eq}}{{#unless bookingIsPushpress}}3. **Booking links.** Confirm the booking/checkout link(s) in `kit.config.ts →
   booking` still open (WebFetch; a 200 is enough).
{{/unless}}4. Pricing table in `kit.config.ts → pricing`: confirm every number.

Build, commit "Setup: {{servicesPluralLower}} and pricing".

## Stage 3 — {{teamPlural}} (15 minutes)

For each person: name spelling, role, credentials (as they want them shown), a
3–5 sentence bio. Ask the owner to tell you about each person in their own
words and write the bio from that — don't invent details. Photos: Stage 5.
Mark `draft: true` on anyone who has left.

The owner's own bio goes on the {{teamPluralLower}} page **and** in
`jeldon.config.ts → authors[0]` (`profile.jobTitle`, `alumniOf`, `memberOf`,
`knowsAbout`). This is what tells Google and AI engines who wrote the articles.

Build, commit "Setup: {{teamPluralLower}}".

## Stage 4 — Their voice (10 minutes)

This is what makes the articles sound like them instead of like a robot.
Ask these, one at a time, and listen:

1. "Describe {{businessName}} to a friend in two sentences."
2. "What do you say to someone who is nervous about their first visit?"
3. "What's a phrase or word you'd never want on your website?"
4. "Paste two posts or emails you've written that sound like you."
5. "Who is the reader you picture when you write — age, situation?"

Then rewrite `jeldon.config.ts → voice.persona`, add to `bannedPhrasings` and
`rules` from the answers, and save the two samples verbatim in
`docs/VOICE-SAMPLES.md` (`/article` reads this file). Read the result back in
one paragraph: "Here's how I'll try to sound." Adjust until they say yes.

Commit "Setup: voice".

## Stage 5 — Photos and logo (10 minutes)

The site works without photos, but photos of real people in the real place are
the single biggest trust signal. Upload through GitHub's website (no tools):

> 1. Go to github.com and open your `{{repoName}}` repository.
> 2. Click the folder `public`, then `photos` (I'll create it if it's missing).
> 3. Click **Add file** (top right) → **Upload files**.
> 4. Drag in 5–10 photos: the space, {{clientPlural}}, the {{teamPluralLower}}, the front door.
>    Then click the green **Commit changes** button.
> 5. Tell me the file names, or just say "done" and I'll look.

After upload run `npm run photos` (resizes anything over 1600px and re-encodes
as WebP; originals move to `public/photos/originals/`), then place photos:
hero (home), {{servicesSingularLower}} pages (`heroImage`), `photo` fields, about page.
Write descriptive `alt` text (what's in the picture, not keywords).

Ask if the logo file in `public/brand/` is current; if they have a better one
(SVG or PNG on transparent background), same upload steps.

Build, commit "Setup: photos".

## Stage 6 — Cloudflare (the one that makes it live) (20 minutes)

Follow `docs/ACCOUNTS.md` → **Cloudflare**, screen by screen. Dashboards
change; if what they see doesn't match, ask them to read the menu names to you
and find the equivalent. Summary:

1. Create a free Cloudflare account (email + password; no card).
2. **Workers & Pages** → **Create** → **Import a repository** → Connect
   GitHub → pick `{{repoName}}`.
3. Settings on that screen: Project name `{{repoName}}`; Build command
   `npm run build`; Deploy command `npm run deploy:cf`. Click **Save and Deploy**.
4. Wait for the green check. They'll get a URL ending in `.workers.dev`.
   Ask them to paste it. Open it with WebFetch to confirm it's the site.
   Write it in `docs/PROGRESS.md`.
5. **Web Analytics**: Cloudflare left menu → **Analytics & Logs** → **Web
   Analytics** → **Add a site** → hostname `{{siteHost}}` → copy the token
   from the snippet (the part after `"token":"`) → paste it here. It is not a
   secret; put it in `kit.config.ts → analytics.cloudflareToken`.

From now on every commit you push deploys in about a minute. Tell them that.

## Stage 7 — Contact form plumbing (20 minutes)

The form needs at least one destination. Do the email first (it's what they'll
notice), then the {{leadSinkLabel}}.

{{#if notifierLabel}}**{{notifierLabel}}** (`docs/ACCOUNTS.md` → {{notifierLabel}}): free account → verify the sender
email → create an API key named `{{repoName}}-website`.

> Important: don't paste the key here. Open Cloudflare in another tab →
> Workers & Pages → {{repoName}} → **Settings** → **Variables and Secrets** →
> **Add** → type `{{notifierEnvKey}}`, choose **Secret**, paste the key → **Deploy**.
> Then add two plain variables: `LEAD_NOTIFY_TO` (their inbox) and
> `LEAD_NOTIFY_FROM` (the sender they verified).
{{/if}}
{{#eq leadSink "pushpress"}}**PushPress API** (`docs/ACCOUNTS.md` → PushPress): developer.pushpress.com →
sign in with the PushPress login → **API Keys** → create one named `website` →
they'll see the key and a **company ID**. Same routine: add `PUSHPRESS_API_KEY`
(secret) and `PUSHPRESS_COMPANY_ID` (variable) in Cloudflare. **Also** add both
under **Settings → Build → Variables and secrets** so the schedule page can
read classes at build time.
{{/eq}}{{#eq leadSink "gohighlevel"}}**GoHighLevel webhook**: in the GHL (or PushPress Grow) workflow builder,
add an **Inbound Webhook** trigger → copy its URL → paste it here (it is not a
secret) → I put it in `kit.config.ts → contact.goHighLevelWebhookUrl`. Map
`first_name`, `last_name`, `email`, `phone`, `message` in the workflow.
{{/eq}}
Then test, together:
1. Trigger a redeploy (push an empty commit "Redeploy for secrets").
2. Run `npm run test:contact -- https://<their>.workers.dev`. Expect `200 {"ok":true}`.
3. Ask them to check the inbox{{#if crmAccountName}}, then {{crmAccountName}} (search "Website Test"){{/if}}.
   If the email arrives but the CRM has nothing, the key or ID is wrong; if
   neither, the redeploy hasn't finished — wait a minute and re-run. Each test
   creates a contact; tell them they can delete it.
{{#eq bookingKind "pushpress"}}4. Optional, only if the schedule page should refresh itself nightly: in
   Cloudflare → the project → Settings → Build → **Deploy hooks** → create one
   → copy the URL → GitHub repo → Settings → Secrets and variables → Actions →
   New repository secret `CF_DEPLOY_HOOK`. The workflow in
   `.github/workflows/nightly-rebuild.yml` then rebuilds at 3 AM so "This
   week" on the schedule never shows stale days.
{{/eq}}
## Stage 8 — Search Console and the old site (10 minutes)

- {{#if hasSiteVerification}}The old site already had a Google Search Console verification tag (it's in
  `kit.config.ts`). Ask them to open search.google.com/search-console and
  confirm they see `{{siteHost}}`. If they don't own it, note it for `/launch`.{{/if}}{{#unless hasSiteVerification}}Ask them to open search.google.com/search-console. If `{{siteHost}}` is not
  listed: **Add property** → **URL prefix** → `https://{{siteHost}}` → **HTML
  tag** → paste the `content="…"` code here (not secret) → I put it in
  `kit.config.ts → analytics.googleSiteVerification`.{{/unless}}
- Open `https://<their>.workers.dev/` with WebFetch and click through the
  main pages. Note anything odd in `docs/PROGRESS.md`.

## Stage 9 — Review together, then plan the launch

1. Run `npm run doctor`, `npm run build`. Fix anything red.
2. Send them the `.workers.dev` link and ask them to click through every page on
   their phone. Collect changes; make them; push.
3. Offer the first article: "Want to write the first {{blogLabelLower}} post now? Type
   `/article` and I'll ask you what you want to write about."
4. When they're happy: "The last step is pointing {{siteHost}} at the new
   site. That one we do with {{helperName}} on the phone — type `/launch` when
   you've set a time." Update `docs/PROGRESS.md`.

## Things to never do in this wizard

- Never invent hours, prices, credentials, bios, or reviews.
- Never ask for or accept an API key, password, or card number in chat.
- Never touch DNS or the domain registrar.
- Never publish an article (`draft: false`) — that's `/publish`, after they read it.
- Never push a build that fails.

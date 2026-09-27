# Your website, in plain English

A map of what's where, so you can ask Claude for changes in your own words.
You never need to open these files yourself.

## The pages

| Page | Address | What's on it |
|---|---|---|
| Home | `/` | The big pitch, the three reasons, the {{servicesPluralLower}} list, how to start, reviews, FAQ, map |
| {{servicesPlural}} | `{{routeServices}}` | Each {{servicesSingularLower}} has its own page under `{{routeServices}}...` |
| {{scheduleLabel}} | `{{routeSchedule}}` | {{scheduleDescription}} |
| {{pricingLabel}} | `{{routePricing}}` | Plans and prices, with sign-up buttons |
| {{teamPlural}} | `{{routeTeam}}` | Everyone on the team with a bio and photo |
| {{blogLabel}} | `{{routeBlog}}` | Articles. Only published ones show |
| {{primaryCtaShort}} | `{{routePrimaryCta}}` | The page everything points to: how to start + the booking button |
| Contact | `{{routeContact}}` | The form, phone, email, map |
| FAQ, About{{#if membersLabel}}, {{membersLabel}}{{/if}} | `{{routeFaq}}`, `{{routeAbout}}`{{#if membersLabel}}, `{{routeMembers}}`{{/if}} | Questions, the story{{#if membersLabel}}, links for current {{clientPlural}}{{/if}} |

## Where the facts live

- **Hours, phone, email, prices, sign-up links, social links** → one file,
  `kit.config.ts`. Say "change Saturday hours to 8–11" and Claude edits it.
- **{{servicesSingular}} descriptions** → one file per {{servicesSingularLower}} in `{{contentDirServices}}/`.
- **{{teamSingular}} bios** → one file per person in `{{contentDirTeam}}/`.
- **FAQ questions** → `{{faqsFile}}`.
- **{{blogLabel}} articles** → one file per article in `{{contentDirArticles}}/`.
  An article with `draft: true` is invisible to visitors.
- **Photos** → the `public/photos/` folder. Upload through GitHub → Add file → Upload files.
- **Who you are, how you write, what the articles should sound like** →
  `jeldon.config.ts`. Claude fills this in during `/setup`.

## How a change goes live

1. You ask Claude for the change.
2. Claude edits the file, checks that the site still builds, and saves ("commits") it.
3. Cloudflare notices and rebuilds the site. About a minute.
4. You refresh the page.

Nothing you ask for can break the live site without Claude noticing first,
because the site is rebuilt from scratch every time and a broken build doesn't go out.

## What the "scores" mean

When Claude writes an article it reports two numbers:

- **Search readiness** — title length, description, headings, links, reading
  level. Google basics.
- **AI-citation readiness (GEO)** — does the article have the things AI
  answer engines (ChatGPT, Perplexity, Google's AI answers) tend to quote:
  real statistics, a source you can click, first-person experience, headings
  phrased as questions. Each article has a target. Below target, Claude
  improves it; but your voice always wins over the number.

And the site as a whole has a **benchmark**: ten ways the new site is measured
against the old one. It launches only when it wins or ties on all ten.

## Things that need you

- Approving every article before it goes live (`/publish`).
- Confirming any business fact (hours, prices, dates).
- Clicking around in Cloudflare{{#if crmAccountName}}, {{crmAccountName}}{{/if}}{{#if notifierLabel}}, {{notifierLabel}}{{/if}} when Claude asks.
- The domain switch, with {{helperName}}.

## Things you never have to do

- Use a terminal. Run commands. Edit code. Fix a broken build. Remember file names.

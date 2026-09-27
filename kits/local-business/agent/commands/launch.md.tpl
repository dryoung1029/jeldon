---
description: Cutover checklist — point {{siteHost}} at the new site, with {{helperName}} on the call, and verify everything after.
---

# /launch — go live on {{siteHost}}

Follow `docs/LAUNCH.md`. This is a two-person step: the owner and {{helperName}}
{{#if helperFullName}}({{helperFullName}}) {{/if}}on a call, you driving. Do not start until the owner confirms {{helperName}} is with them.

## Before the call (you, alone)

- Run `/benchmark`. Every dimension must be **win** or **tie**. If any is
  behind, fix it first; launch waits. Attach the scorecard to `docs/PROGRESS.md`.
- `npm run doctor` — no errors. `npm run build` green. `/audit` mode B clean.
- Confirm the contact form works on the `.workers.dev` URL (`npm run test:contact`).
- Confirm `public/_redirects` covers every URL in `docs/OLD-URLS.md`.
- WebFetch the old site's sitemap ({{oldUrl}}/sitemap.xml) and make sure each
  URL there has a matching new page or a redirect.
- Write the plan into `docs/PROGRESS.md` and tell the owner what will happen.

## On the call

1. **Where is the domain?** Ask {{helperName}} to run a WHOIS (lookup.icann.org) for
   `{{siteHost}}` and read the registrar. The owner logs in there.
2. **Add the domain to the Cloudflare project**: Cloudflare → Workers & Pages →
   {{repoName}} → **Settings** → **Domains & Routes** → **Add** → **Custom
   domain** → `{{siteHost}}`, then again for `www.{{siteHost}}`. Cloudflare
   shows the DNS records it needs.
3. **Two paths, {{helperName}} picks:**
   - **Easiest long-term:** move DNS to Cloudflare (Cloudflare → Add a site →
     `{{siteHost}}` → free plan → it lists existing records → at the
     registrar, change nameservers to the two Cloudflare gives). Then the
     custom domain step above just works.
   - **Minimal change:** keep the current DNS host and add the records
     Cloudflare showed (a CNAME for `www` and the root record it specifies).
   Either way: **keep every MX and email-related record exactly as it is.**
   Email must keep working. Read them back before saving.
4. Lower TTLs first if the DNS host allows it; wait; then change records.
5. Watch: WebFetch `https://{{siteHost}}/` every few minutes until the new
   site answers. Both `www` and root must work and redirect to one canonical
   (per `jeldon.config.ts → brand.siteUrl`).

## Right after

- WebFetch 10 old URLs from `docs/OLD-URLS.md` — each must 301 to the right page.
- Search Console: **Sitemaps** → submit `https://{{siteHost}}/sitemap-index.xml`.
  URL Inspection on the home page → **Request indexing**.
- Google Business Profile: website field → `https://{{siteHost}}/`; add the
  `{{routePrimaryCta}}` link as the "Appointment" link.
- Any "website" links in emails/automations → new URLs. Social bio links →
  `https://{{siteHost}}{{routePrimaryCta}}`.
- Cloudflare Web Analytics: confirm data is arriving (visits > 0 next day).
- Old site: ask the owner to leave it up but unpublished for 30 days if the old
  host allows; retire it only after redirects are confirmed.

## The next day

`npm run test:contact -- https://{{siteHost}}`, check the email and the lead
landed. `npm run benchmark -- --old {{oldUrl}} --new https://{{siteHost}}` one
more time for the record. Update `docs/PROGRESS.md`: **Launched <date>**. Then
say congratulations, and mean it.

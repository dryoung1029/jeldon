# Launch checklist (the DNS cutover)

`/launch` drives this with the owner and {{helperName}} on a call. Reference only.

## Ready when
- [ ] `npm run benchmark -- --ci` passes (every dimension win or tie vs the baseline)
- [ ] `npm run doctor` has no errors; `npm run build` green
- [ ] Owner has clicked every page on their phone and approved
- [ ] Contact form tested on the `.workers.dev` URL: email received{{#if crmAccountName}}, {{crmAccountName}} lead created{{/if}}
- [ ] At least one published article (optional but recommended)
- [ ] `public/_redirects` covers every URL in `docs/OLD-URLS.md` and every URL in the old site's sitemap
- [ ] Owner has access to Google Search Console for `{{siteHost}}`
- [ ] {{helperName}} has run WHOIS on `{{siteHost}}` and knows the registrar and current DNS host

## The switch (see `.claude/commands/launch.md` for the step-by-step)
1. Custom domains added in Cloudflare (root + www)
2. Nameservers moved to Cloudflare **or** the specific records added at the current DNS host
3. All MX / email records preserved verbatim
4. Wait; verify root and www both serve the new site with HTTPS

## After
- [ ] Redirect spot-check (10 old URLs)
- [ ] Sitemap submitted; home page "Request indexing"
- [ ] Google Business Profile website + appointment link updated
- [ ] Social bios updated
- [ ] Web Analytics receiving
- [ ] Old site left unpublished for 30 days, then retired
- [ ] `docs/PROGRESS.md` updated: Launched <date>; final benchmark scorecard committed

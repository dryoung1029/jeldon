# Design rules (Local Business Kit)

Tokens are generated at build time from `jeldon.config.ts → brand.brandColors`
and `brand.fonts`, mapped by `kit.config.ts → theme` (primary / accent /
neutral / highlight) and inlined into every page by `BaseLayout`. Edit the
pack, not the CSS.

- **Colors.** `--primary` does the work (links, structure, secondary buttons).
  `--accent` is spent **once per page**: the primary-CTA button (and the hero
  mark). Neutral text on white; dark mode is automatic with a header toggle.
  Derived shades (`-deep`, `-tint`) are computed from the one hex you set.
- **Type.** One family (`brand.fonts.display`, loaded from
  `brand.fonts.googleFontsHref` when set). Weights: 400 body, 700 emphasis
  and nav, 800 headings. Fluid size scale (`--step-*`). Line length capped at
  66 characters (`--measure`).
- **Layout.** Left-aligned. `.container` (max 72rem) and `.section` spacing.
  `.split` for two columns on wide screens. **No SaaS card kit**: cards only
  where a thing is genuinely a card (pricing plans, member links); services
  are a list with rules, not cards.
- **Buttons.** `.btn--primary` (accent) = the one action we want.
  `.btn--secondary` = sign up for a plan. `.btn--ghost` = everything else.
- **FAQ** uses native `<details>`; every FAQ block also emits FAQPage JSON-LD.
- **No motion** except things the user opens. Reduced-motion is respected.
- **Every page** sets a unique title (aim 40–60 chars; short page names are
  fine) and description (120–160), passes breadcrumb JSON-LD, has one H1.
- **Images**: WebP, sized, lazy below the fold, descriptive alt text. Photos of
  real people in the real place beat stock every time; no stock photos.
- **Copy**: sentence case, plain verbs, no ALL-CAPS labels, no arrows on links.
  The site talks the way the owner talks to a customer.

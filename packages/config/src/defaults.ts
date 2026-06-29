import type {
  AmplifyConfig,
  AnalyticsConfig,
  DraftingConfig,
  EntityPresenceConfig,
  GeoConfig,
  MediaConfig,
  ScoringConfig,
  SeoConfig,
  StrategyConfig,
} from './types.js';

/**
 * Canonical scoring defaults, ported verbatim from the source system
 * (Body of Health `src/lib/admin/seo.ts`). A new project gets identical
 * scoring behavior unless it overrides these — but every value here is a knob,
 * not a constant. The Princeton GEO findings the weights encode are
 * domain-general; the detection patterns are the part a non-health domain
 * overrides (see the Northwatch example).
 */

export const defaultGeoConfig: GeoConfig = {
  floor: 70,
  checks: [
    {
      id: 'statistic',
      label: 'Statistic density',
      weight: 25,
      kind: 'regexPer1k',
      target: 'cleaned',
      patterns: ['(\\d+(?:\\.\\d+)?\\s*%|\\b\\d+\\s*[-\\u2013\\u2014]\\s*\\d+\\b|\\b\\d{1,4}(?:[,.]\\d+)?\\b)'],
      flags: 'g',
      thresholds: [10, 5],
    },
    {
      id: 'quote',
      label: 'Direct quotes (attributed)',
      weight: 25,
      kind: 'regexCount',
      target: 'cleaned',
      patterns: ['"[^"]{20,300}"[\\s\\S]{0,80}?(?:\\bet al\\b|\\bguideline\\b|\\bstudy\\b|\\btrial\\b|\\breview\\b|\\(\\d{4}\\)|\\b\\d{4}\\b)'],
      flags: 'gi',
      thresholds: [2, 1],
    },
    {
      id: 'citation',
      label: 'Citation density',
      weight: 15,
      kind: 'regexPer1k',
      target: 'body',
      patterns: ['pubmed\\.ncbi\\.nlm\\.nih\\.gov|doi\\.org\\/|pmid[:\\s]*\\d|PMC\\d{5,}'],
      flags: 'gi',
      thresholds: [2, 1],
    },
    {
      id: 'firstPerson',
      label: 'First-person markers',
      weight: 15,
      kind: 'regexCount',
      target: 'cleaned',
      patterns: ['\\bwhen I\\b|\\bI (?:see|find|treat|tell|recommend|use|approach|look|hear|order|refer)\\b|\\bin our (?:clinic|practice|office)\\b|\\bour patients\\b|\\bwe (?:see|treat|find|use|recommend|order|refer)\\b'],
      flags: 'gi',
      thresholds: [4, 2],
    },
    {
      id: 'questionH2',
      label: 'Question H2s',
      weight: 10,
      kind: 'questionH2',
      patterns: ['what', 'when', 'why', 'how', 'can', 'do', 'does', 'is', 'are', 'should', 'will', 'who'],
      thresholds: [2, 1],
    },
    {
      id: 'authority',
      label: 'Authority markers',
      weight: 10,
      kind: 'regexCount',
      target: 'cleaned',
      patterns: ['\\baccording to\\b|\\bas reported by\\b|\\bpublished in\\b|\\bet al\\.?\\b|\\bguidelines?\\b|\\bcohort\\b|\\bRCT\\b|\\brandomi[sz]ed\\b|\\bmeta[- ]?analys[ei]s\\b|\\bsystematic review\\b|\\bcochrane\\b'],
      flags: 'gi',
      thresholds: [3, 1],
    },
  ],
};

export const defaultSeoConfig: SeoConfig = {
  title: { good: [40, 60], mehMax: 70 },
  excerpt: { good: [120, 160], meh: [80, 200] },
  slugMaxLen: 60,
  wordCount: { good: [800, 2200], mehMin: 500 },
  bodyChars: { good: 10000, meh: 12000 },
  h2: { good: [3, 6], meh: [2, 8] },
  internalLinks: { good: 2, meh: 1 },
  tags: { good: [3, 6], mehMin: 1 },
  heroAltWords: { good: [4, 18] },
  reading: { good: [6, 9], mehMax: 11 },
  internalLinkPrefixes: ['articles', 'conditions', 'care', 'team'],
  referenceSectionNames: ['references', 'citations', 'sources', 'bibliography', 'further reading', 'works cited'],
  evidenceTriggers: ['studies', 'study', 'research', 'evidence', 'trials', 'meta-analysis', 'systematic reviews', 'cochrane', 'literature', 'guidelines', 'RCT', 'randomized'],
  badFilenameRe: '^(img[_-]?\\d|dsc[_-]?\\d|photo[_-]?\\d|untitled|screenshot|image\\d|pasted)',
};

export const defaultScoringConfig: ScoringConfig = {
  geo: defaultGeoConfig,
  seo: defaultSeoConfig,
};

/**
 * Strategy-engine defaults, ported verbatim from Body of Health
 * `src/lib/admin/strategy.ts` (the thresholds, the SITE_ROUTE_404 regexes, the
 * referer needle groups, the deep-links and the evidence/title copy). Every
 * value here is a knob: a non-content domain re-points `siteRoute404Patterns`
 * at its own routes, re-voices `copy`, and re-targets `deepLinks` without
 * touching engine code. `{token}` placeholders in copy are filled by the rule.
 */
export const defaultStrategyConfig: StrategyConfig = {
  thresholds: {
    real404MinRequests: 8,
    real404HighRequests: 50,
    serverError5xxMin: 100,
    serverError5xxHigh: 500,
    topContentPaths: 12,
    geoHighTopRank: 3,
    geoTargetMargin: 5,
    audioTopRank: 5,
    socialMinReferrers: 20,
    socialGapFraction: 0.03,
    socialGapFloor: 5,
    climbRankRange: [4, 10],
    climbMax: 2,
    maxRecommendations: 12,
  },
  // Positive-match families for OUR content URLs (BoH SITE_ROUTE_404). A 404 on
  // one of these is a broken internal link or an old URL worth a 301; every
  // other 404 is bot/scanner noise and stays silent.
  siteRoute404Patterns: [
    '^/articles/[a-z0-9-]+/?$',
    '^/conditions/[a-z0-9-]+/?$',
    '^/care/[a-z0-9-]+(/[a-z0-9-]+)?/?$',
    '^/team/[a-z0-9-]+/?$',
    '^/locations/[a-z0-9-]+/?$',
  ],
  articlePathPattern: '^/articles/([^/]+)$',
  refererGroups: {
    social: ['facebook', 'instagram', 'x /', 'twitter', 'linkedin', 'youtube'],
    search: ['google search', 'google'],
  },
  liveCrawlPurpose: 'live',
  deepLinks: {
    brokenLinks: { link: '/admin/links', linkLabel: 'Broken links' },
    editArticle: { link: '/admin/{slug}', linkLabel: 'Edit' },
    amplify: { link: '/admin', linkLabel: 'Pick an article → Amplify' },
    priorityKeywords: { link: '/admin/competitors/priority-keywords', linkLabel: 'Priority keywords' },
  },
  copy: {
    'health-404': {
      title: 'Real 404s to fix',
      evidence:
        'Real site paths returning 404 (bot/scanner noise excluded): {offenders}. 301 each to its current page, or fix the link pointing at it. The overall 404 rate is higher but is dominated by harmless automated probes, which don’t need action.',
    },
    'health-5xx': {
      title: 'Server/origin errors to investigate',
      evidence:
        '{count} 5xx responses over {windowDays}d ({detail}). 52x = the edge couldn’t reach the origin; 500s may be Function errors.',
    },
    'geo-citability': {
      title: 'Strengthen "{title}" for AI citation',
      evidence:
        'A top-traffic page ({requests} requests/{windowDays}d) scoring GEO {geo} vs the {target} target for {category}. High traffic + low citability is answer-engine surface left on the table.',
    },
    'audio-coverage': {
      title: 'Add narration to "{title}"',
      evidence:
        'A top-{rank} page by traffic with no audio — a quick win for the podcast feed and on-page engagement.',
    },
    'dist-social': {
      title: 'Almost no social referrals — amplify your top pages',
      evidence:
        'Social sent ~{social} visits over {referrersDays}d vs {search} from search. Run the Amplify kit on your highest-traffic articles to seed social channels.',
    },
    'seo-climb': {
      title: 'Climb "{keyword}" (rank #{rank})',
      evidence:
        'Search is already a top referrer, and you sit at #{rank} for "{keyword}" — the page-2-to-1 range where small gains convert. Strengthen the matching page.',
    },
    'aeo-live-crawl': {
      title: 'Answer engines are fetching you live — verify citations',
      evidence:
        '{live} live-retrieval crawler hits (ChatGPT / Perplexity / Claude users) in the last day. Check the Answer-engine presence panel — crawled-but-not-cited is a citability gap to close.',
    },
  },
};

/**
 * Drafting + editor-chat defaults, ported from Body of Health `author.ts` /
 * `chat.ts` (the MODELS map, the 70/70 draft floor, the 800–1500 word target,
 * the 10 000-char TTS ceiling, the per-mode max_tokens). Every value is a knob;
 * @jeldon/drafting falls back to this when `pack.drafting` is omitted. The model
 * ids match BoH's aliases — a domain on a different provider re-points them.
 */
export const defaultDraftingConfig: DraftingConfig = {
  models: {
    sonnet: 'claude-sonnet-4-6',
    opus: 'claude-opus-4-7',
    haiku: 'claude-haiku-4-5',
  },
  defaultModel: 'sonnet',
  utilityModel: 'haiku',
  draftFloor: { seo: 70, geo: 70 },
  wordCountTarget: [800, 1500],
  bodyCharCeiling: 10000,
  maxTokens: {
    brainstorm: 1500,
    draft: 16000,
    outline: 4000,
    'draft-series': 64000,
    'draft-series-article': 12000,
    fixPass: 16000,
    extractClaims: 1500,
    chat: 32000,
  },
};

/**
 * Amplification defaults, ported verbatim from Body of Health
 * `src/pages/api/admin/amplify/[slug].ts` (channels, UTM map, tool-field
 * descriptions) + `carousel/[slug].ts` (COLOR_SCHEMES + the carousel craft
 * prompt) + `newsletter-content.ts` (the newsletter shape).
 *
 * Per docs/DECOUPLING-NOTES.md "Voice block duplicated ×4": the voice rules are
 * NOT here — they live once in `pack.voice` and `buildKitSystem()` injects them.
 * What's here is the *channel craft*, which is the same regardless of voice.
 * Every label/guidance/UTM is a knob a non-clinic domain re-points.
 */
export const defaultAmplifyConfig: AmplifyConfig = {
  systemPreamble:
    'You are a content distribution editor. A new article was just published, and you are producing copy for every channel it gets distributed through. Each piece pushes traffic to the article URL while standing on its own — readers should not need to click to get value. Match the brand voice across all channels; do not translate clinical/expert clarity into marketing speak.',
  channels: [
    {
      id: 'gbp',
      label: 'Google Business Profile post',
      utm: 'utm_source=gbp&utm_medium=organic',
      guidance:
        'GOOGLE BUSINESS PROFILE POST\n- 750-character HARD LIMIT (Google truncates beyond this — count carefully).\n- Open with a hook that names the reader problem. End with a CTA + the article URL.\n- One emoji max, used purposefully or not at all.\n- No hashtags (Google ignores them).\n- This is for local-search prospects who already found the business — bias toward "here is what we would actually do about this."',
      fieldDescription: 'Google Business Profile post. ≤750 characters including the URL.',
    },
    {
      id: 'facebook',
      label: 'Facebook post',
      utm: 'utm_source=facebook&utm_medium=social',
      guidance:
        'FACEBOOK POST\n- 200-500 chars is the sweet spot. Engagement comes from a question or counter-intuitive opener.\n- One emoji is fine, hashtags hurt rather than help on FB. Skip them.\n- End with the article URL on its own line so Facebook auto-previews.',
      fieldDescription: 'Facebook post. 200-500 chars + URL on its own final line.',
    },
    {
      id: 'instagram',
      label: 'Instagram caption',
      guidance:
        'INSTAGRAM CAPTION\n- 800-1500 chars works. Story-driven: open with a scene, pull to the article main insight, close with a CTA.\n- 5-10 relevant hashtags at the bottom (mix of broad and local). NOT keyword-stuffed.\n- Note: IG does not make a link in the caption clickable. CTA should say "link in bio" — do not paste the URL.',
      fieldDescription:
        'Instagram caption. 800-1500 chars + 5-10 hashtags. CTA says "link in bio".',
    },
    {
      id: 'linkedin',
      label: 'LinkedIn post',
      utm: 'utm_source=linkedin&utm_medium=social',
      guidance:
        'LINKEDIN POST\n- 700-1500 chars. Frame the author as a practitioner, not a marketer. Structure: observation from practice → tension/insight → what they do about it → optional question.\n- Line breaks are critical on LinkedIn (every 1-2 sentences). Use them aggressively.\n- 3-5 hashtags MAX, mostly professional. Article URL at the end.',
      fieldDescription: 'LinkedIn post. 700-1500 chars + 3-5 professional hashtags + URL.',
    },
    {
      id: 'newsletterSubject',
      label: 'Newsletter subject line',
      noUrl: true,
      guidance:
        'NEWSLETTER SUBJECT\n- 40-60 chars, intriguing without being clickbait. No "You won\'t believe..." energy.',
      fieldDescription: 'Email subject line, 40-60 chars.',
    },
    {
      id: 'newsletterBody',
      label: 'Newsletter body',
      utm: 'utm_source=newsletter&utm_medium=email',
      guidance:
        'NEWSLETTER BODY\n- 80-130 words. Frame the article in context — what prompted it, what readers get. End with a clear "Read it here:" + link placeholder.',
      fieldDescription: 'Email body, 80-130 words. Ends with "Read it here:" + URL.',
    },
    {
      id: 'podcastHook',
      label: 'Podcast hook',
      noUrl: true,
      guidance:
        'PODCAST HOOK\n- A 2-3 sentence pitch for a podcast episode that builds on this article angle. Suggest a guest, a specific opening question, or a related-but-deeper angle worth a 30-minute conversation. Not the article rehashed — a logical next.',
      fieldDescription: '2-3 sentence pitch for a podcast episode that builds on this article.',
    },
  ],
  carouselSchemes: [
    { id: 'cream-burgundy', label: 'Cream + Burgundy', bg: '#f5f0e6', fg: '#a03038', accent: '#000000' },
    { id: 'white-black', label: 'White + Black', bg: '#ffffff', fg: '#000000', accent: '#a03038' },
    { id: 'black-cream', label: 'Black + Cream', bg: '#000000', fg: '#f5f0e6', accent: '#d65560' },
    { id: 'burgundy-cream', label: 'Burgundy + Cream', bg: '#a03038', fg: '#f5f0e6', accent: '#ffffff' },
    { id: 'tan-black', label: 'Tan + Black', bg: '#c8b8a0', fg: '#000000', accent: '#a03038' },
    { id: 'coral-white', label: 'Coral + White', bg: '#d65560', fg: '#ffffff', accent: '#000000' },
    { id: 'blush-burgundy', label: 'Blush + Burgundy', bg: '#fef0f1', fg: '#a03038', accent: '#000000' },
    { id: 'black-white', label: 'Black + White', bg: '#000000', fg: '#ffffff', accent: '#c8b8a0' },
  ],
  carouselGuidance: `You design Instagram text carousels. Carousels live or die on slide 1. Engineer a sequence that REWARDS the swipe at every step — readers should feel something is missing if they stop on any slide before the end.

SLIDE 1 — THE HOOK
Must be hard to scroll past. Use one of: a pattern interrupt (a claim that contradicts assumption), specificity + authority (a real number from experience), a named myth, a curiosity gap (a question the next slide answers), or pattern + counter (set an expectation, then break it).
NEVER: declarative statements that could appear in any generic blog, "Did you know…" prefixes, vague "5 things…" intros, emoji.

SLIDES 2 through N-1 — PROGRESSIVE REVEAL
Each slide must end on an OPEN LOOP — something the reader needs the next slide to resolve. setup → tension → resolution → next setup. ONE idea per slide. 4-14 word body MAX — headline energy, not paragraphs.

LAST TEXT SLIDE (N) — THE PAYOFF
The reveal that ties it together. NOT a CTA — the hero slide handles that. Must feel earned.

SLIDE-LEVEL RULES
- BODY: 4-14 words, treat as a headline.
- KICKER (optional small label above body): use SPARINGLY for slot labels like "1/6", "THE MYTH", "BOTTOM LINE".
- FOOTER (optional small label below body): rarely used.
- No emoji or hashtags in slides (those belong in the caption).
- Vary slide structure — not every slide should have a kicker.

REFINEMENT MODE
If a <current_carousel> block is present, PRESERVE every slide and field exactly EXCEPT what the refinement explicitly asks to change. Positional vocabulary: "top"/"above" → kicker; "middle"/"headline" → body; "bottom"/"below"/"footer" → footer; "slide N" → that index.`,
  newsletterGuidance: `You are writing the newsletter email that goes to subscribers about a just-published article.

Newsletter shape:
- Subject line: 40-60 characters. Intriguing without clickbait. No "You won't believe…" energy. Skip emoji unless it earns its keep.
- Body: 80-130 words. Frame what prompted the article and what readers get from it. Treat it as a personal note from the author, not a press release. Do NOT include "Read it here:" or any URL — the email template handles the CTA. End with a sentence that lands; the template adds the button.

The subscriber already opted in. You don't need to sell them on existing — sell them on this specific piece.`,
  carouselStateDir: 'src/data/carousel-state',
};

/**
 * Media defaults, ported verbatim from Body of Health `src/lib/admin/narration.ts`
 * (voice settings, outro, IPA + abbreviation tables, chunk/cap thresholds),
 * `src/pages/api/admin/audio/[slug].ts` (the voice id + model + safety caps),
 * `src/pages/api/admin/image-prompt/[slug].ts` (the locked sketchbook prompt
 * template + art-director system prompt), and `src/pages/podcast.xml.ts`
 * (the show metadata + trailer). Every value is a knob; @jeldon/media falls
 * back to this when `pack.media` is omitted. The brand-specific strings (outro,
 * Corvallis/Willamette IPA, sketchbook palette, podcast description) are the
 * BoH default — a non-clinic domain re-points them via `pack.media`.
 */
export const defaultMediaConfig: MediaConfig = {
  narration: {
    voiceId: 'ub1bdJ7dPhQjIuMcGZiq',
    model: 'eleven_multilingual_v2',
    voiceSettings: {
      stability: 0.3,
      similarity_boost: 0.8,
      style: 0.25,
      use_speaker_boost: true,
    },
    outroText:
      "Thanks for listening. If you found this useful, share it with someone who'd benefit. I'm Dr. Jason Young — more evidence-informed musculoskeletal content at yourbodyofhealth.com. Subscribe to our newsletter or R S S feed there to know when we publish something new.",
    pronunciationOverrides: [
      { word: 'neuromusculoskeletal', ipa: 'ˌnʊroʊˌmʌskjələˈskɛlətəl' },
      { word: 'musculoskeletal', ipa: 'ˌmʌskjələˈskɛlətəl' },
      { word: 'skeletal', ipa: 'ˈskɛlətəl' },
      { word: 'Corvallis', ipa: 'kɔrˈvæləs' },
      { word: 'Willamette', ipa: 'wɪˈlæmɪt' },
    ],
    abbreviationExpansions: [
      { abbr: 'MPH', full: 'miles per hour' },
      { abbr: 'mph', full: 'miles per hour' },
      { abbr: 'MPG', full: 'miles per gallon' },
      { abbr: 'BPM', full: 'beats per minute' },
      { abbr: 'BMI', full: 'B M I' },
      { abbr: 'BP', full: 'blood pressure' },
      { abbr: 'ROM', full: 'range of motion' },
      { abbr: 'NSAIDs', full: 'N-saids' },
      { abbr: 'NSAID', full: 'N-said' },
      { abbr: 'OTC', full: 'over the counter' },
      { abbr: 'MRI', full: 'M R I' },
      { abbr: 'CT', full: 'C T' },
      { abbr: 'EKG', full: 'E K G' },
      { abbr: 'ECG', full: 'E C G' },
      { abbr: 'OBGYN', full: 'O B G Y N' },
      { abbr: 'PT', full: 'physical therapy' },
      { abbr: 'OT', full: 'occupational therapy' },
      { abbr: 'PIP', full: 'P I P' },
      { abbr: 'UM', full: 'U M' },
      { abbr: 'VA', full: 'V A' },
      { abbr: 'RCT', full: 'randomized controlled trial' },
      { abbr: 'RCTs', full: 'randomized controlled trials' },
      { abbr: 'TBI', full: 'T B I' },
      { abbr: 'ACL', full: 'A C L' },
      { abbr: 'MCL', full: 'M C L' },
      { abbr: 'TMJ', full: 'T M J' },
      { abbr: 'SI', full: 'S I' },
    ],
    chunkChars: 9000,
    maxChars: 30000,
    referenceSectionNames: [
      'references',
      'citations',
      'sources',
      'bibliography',
      'further reading',
      'works cited',
      'notes',
    ],
  },
  heroImage: {
    model: 'gpt-image-2',
    size: '1024x1536',
    quality: 'medium',
    promptTemplate: `Minimalist editorial illustration in a hand-drawn felt-marker sketch style inspired by historical medical notebook drawings and visual whiteboard storytelling.

Background should be warm off-white or soft cream (#f5f0e6) with subtle paper texture.

Illustration style uses expressive black ink lines with visible hand-drawn imperfections, variable stroke thickness, crosshatching, sketch shading, and occasional marker bleed. The image should feel intelligently human-made, not digitally polished.

Primary accent color palette:
- Deep burgundy #a03038
- Warm tan #c8b8a0
- Muted coral #d65560
- Soft blush #fef0f1

Use color sparingly and intentionally:
- Burgundy for emphasis, titles, arrows, pain areas, important words
- Tan for dividers, highlights, quote boxes, or subtle backgrounds

Layout style:
- Visual sketchnote / infographic composition
- Handwritten typography
- Strong visual hierarchy
- Multiple simple panels or sections
- Large bold headline
- Minimal clutter
- Easy to understand in under 3 seconds

Include:
- hand-drawn arrows
- doodles and symbolic icons
- simplified anatomy
- stick-figure style humans when appropriate
- historical sketch energy
- negative space
- slightly asymmetrical layout for authenticity

Faces should look like ink sketch portraits rather than cartoons. Historical figures should resemble vintage newspaper or notebook illustrations with crosshatching and engraved-style pen detail.

Avoid:
- glossy gradients
- corporate vector graphics
- photorealism
- stock illustration aesthetics
- overly polished symmetry
- AI-generated "medical brochure" look
- 3D rendering
- typos, misspellings, garbled or invented words in any handwritten text
- repeated text, duplicate labels, or the same headline appearing twice

Every word visible in the image must be a real, correctly-spelled English word. Each headline and label appears exactly once.

Overall mood: evidence-based, historical, thoughtful, rebellious, intelligent, approachable, human.

Topic: {TOPIC}

Core visual concept: {CONCEPT}

Format: vertical 4:5 editorial composition optimized for blog posts and social media.`,
    proposalSystem: `You are an art director for Body of Health, a chiropractic clinic in Corvallis, Oregon. Every article gets a hero illustration in the SAME locked style — "PTCH Heritage Sketch": historical medical notebook meets editorial sketchnote meets felt-marker whiteboard. Hand-drawn black ink with crosshatching, expressive imperfections, and sparse intentional accent color on warm cream paper. Energy: evidence-based, historical, thoughtful, rebellious. Think 19th-century anatomy notebook redrawn by a sharp modern editor with a felt-tip pen and an opinion. You are NOT inventing the style; you are filling exactly two slots in a locked master template.

The image is built from these ingredients (the template provides the technique — you don't):
- Black ink line work, crosshatching, sketch shading, marker bleed, variable stroke thickness
- Multiple simple panels OR a single composition — both fit the style. Pick whichever serves the idea.
- Handwritten typography for headlines and labels (sometimes you'll specify what the headline says)
- Hand-drawn arrows, doodles, symbolic icons, simplified anatomy
- Stick-figure humans for action/posture, ink-sketch portraits for named people (engraved newspaper-style crosshatching for historical figures)
- Sparse, intentional accent color: burgundy for emphasis/titles/arrows/pain areas/important words; tan for dividers/highlights/quote boxes/subtle backgrounds
- Slight asymmetry — never overly polished symmetry
- Negative space, but not minimalism for its own sake. Dense detail is fine when it earns the page.

Your job: read the article and decide WHAT the page shows — nothing about technique, palette, or rendering.

GOOD concepts share these traits: they fit the heritage/notebook/rebellious tone, they can be drawn entirely in ink + accent color, they reward a 3-second skim AND a 30-second read. Several shapes work well:

  • Multi-panel sketchnote
  • Historical figure + commentary
  • Anatomy notebook diagram
  • Metaphor with labels
  • Cause-and-effect editorial spread
  • Mythbuster contrast

REQUIRED in every CONCEPT:
- State the layout explicitly (single composition vs multiple panels — and how many)
- State what any handwritten typography says (headlines, labels, quotes) — these are part of the image
- State WHERE the accent colors land (burgundy on X, tan dividers on Y) — never just "use accent colors"
- If portraits are involved, say so and specify the style (engraved-newspaper crosshatching for historical figures, three-quarter ink-sketch for patients)
- Lean into the historical/notebook/rebellious energy — boring "explainer infographic" concepts get rewritten

HARD BANS — never describe any of these:
- Photographic realism, photorealism, 3D rendering, glossy surfaces, color gradients, soft focus, depth of field
- Cartoony Pixar-style human faces (use stick figures or ink-sketch portraits only)
- The AI-generic medical illustration trope set: glowing nervous systems, holographic spines, color-saturated chakra anatomy, hands holding holograms, doctor in white coat smiling, anatomy in front of a starscape, person looking thoughtfully at a tablet
- Clip art, rounded-corner shapes, decorative ribbons or badges, "infographic" iconography
- Polished corporate vector graphics, perfect geometric symmetry
- Rendered medical equipment

Output requirements:
1. TOPIC: 3-10 word noun phrase naming the article subject.
2. CONCEPT: 3-6 sentences. Specific about LAYOUT, what each element shows, what any handwritten text says, and where accent colors land.
3. ALT TEXT: 8-15 words describing what the image SHOWS. Plain factual sentence.
4. FILENAME: lowercase, hyphen-separated, .webp extension, derived from the article slug + 1-2 word purpose tag.
5. RATIONALE: one sentence on why this concept fits the article AND the heritage style.`,
  },
  podcast: {
    title: 'Body of Health — Read by Dr. Young',
    subtitle: 'Evidence-informed chiropractic and musculoskeletal health, narrated.',
    description:
      "Every article from Body of Health Chiropractic & Wellness Center in Corvallis, Oregon, narrated in Dr. Jason Young's voice. Direct, evidence-informed takes on chiropractic care, musculoskeletal health, sports injuries, auto injuries, pregnancy care, and the practice of medicine. Audio is AI-generated from a voice clone of Dr. Young, with his approval, from the same articles published at yourbodyofhealth.com.",
    author: 'Dr. Jason Young, DC',
    ownerEmail: 'contact@yourbodyofhealth.com',
    category: 'Health & Fitness',
    subcategory: 'Alternative Health',
    copyright: '© Body of Health Chiropractic & Wellness Center',
    language: 'en-us',
    coverImage: '/images/body-of-health-logo-only-white-bg.png',
    charsPerMinute: 950,
    trailer: {
      title: 'Welcome — what this feed is, and how the articles get written',
      audioPath: '/audio/podcast-intro.mp3',
      audioSize: 1830770,
      duration: '01:54',
      pubDate: new Date('2026-05-28T00:00:00Z').toUTCString(),
      summary:
        'A short introduction to Body of Health — Read by Dr. Young. What’s on this feed, how every article is clinician-reviewed and citation-verified through cite8, and a candid note about the AI voice. About two minutes.',
    },
  },
};

/**
 * Off-site entity-presence defaults (@jeldon/entity-presence). NEW module — not
 * ported from the source system; designed from docs/AEO-PLAYBOOK.md §"The
 * biggest lever the source system doesn't have yet". The source set + per-engine
 * affinities encode the documented finding that off-site mentions correlate
 * ~3× stronger with AI visibility than backlinks, and differ per engine
 * (Reddit → Perplexity, Wikipedia/consensus → ChatGPT, structured depth →
 * Claude). Every value is a knob: a non-clinic domain re-points `hostNeedles`,
 * re-weights sources, and re-tunes `engineAffinities` without touching engine
 * code. @jeldon/entity-presence falls back to this when `pack.entityPresence`
 * is omitted.
 */
export const defaultEntityPresenceConfig: EntityPresenceConfig = {
  sources: [
    {
      id: 'reddit',
      label: 'Reddit',
      hostNeedles: ['reddit.com'],
      weight: 1.0,
      napConsistencyChecked: false,
    },
    {
      id: 'wikipedia',
      label: 'Wikipedia',
      hostNeedles: ['wikipedia.org'],
      weight: 0.9,
      napConsistencyChecked: false,
    },
    {
      id: 'quora',
      label: 'Quora',
      hostNeedles: ['quora.com'],
      weight: 0.5,
      napConsistencyChecked: false,
    },
    {
      id: 'youtube',
      label: 'YouTube',
      hostNeedles: ['youtube.com', 'youtu.be'],
      weight: 0.6,
      napConsistencyChecked: false,
    },
    {
      id: 'comparison-listicle',
      label: 'Comparison / "best-of" listicle',
      hostNeedles: ['yelp.com', 'healthgrades.com', 'expertise.com', 'threebestrated.com'],
      weight: 0.8,
      napConsistencyChecked: true,
    },
    {
      id: 'directory',
      label: 'Business directory',
      hostNeedles: ['mapquest.com', 'bbb.org', 'chamberofcommerce.com', 'manta.com'],
      weight: 0.4,
      napConsistencyChecked: true,
    },
  ],
  // Documented per-engine retrieval leanings (directional — the playbook treats
  // these as starting weights, not gospel; a domain re-tunes from its own
  // @jeldon/aeo-audit citation data).
  engineAffinities: [
    {
      engine: 'perplexity',
      affinity: { reddit: 1.0, wikipedia: 0.6, 'comparison-listicle': 0.7, quora: 0.5, youtube: 0.4, directory: 0.3 },
      note: 'Leans hard on Reddit + fresh discussion threads.',
    },
    {
      engine: 'anthropic',
      affinity: { wikipedia: 0.9, 'comparison-listicle': 0.8, reddit: 0.6, directory: 0.5, quora: 0.4, youtube: 0.3 },
      note: 'Favors structured, depth-rich, well-sourced surfaces.',
    },
    {
      engine: 'openai',
      affinity: { wikipedia: 1.0, reddit: 0.7, 'comparison-listicle': 0.6, quora: 0.5, youtube: 0.4, directory: 0.4 },
      note: 'Consensus/Wikipedia-weighted; rewards broad agreement.',
    },
    {
      engine: 'google-aio',
      affinity: { 'comparison-listicle': 0.9, directory: 0.7, reddit: 0.6, wikipedia: 0.6, youtube: 0.5, quora: 0.3 },
      note: 'Mirrors organic SERP authority — listicles + directories.',
    },
  ],
  establishedThreshold: 3,
};

/**
 * Crawler + edge-analytics defaults, ported verbatim from Body of Health.
 *
 * - `aiBotList` is the UNION of the two source lists (`src/lib/admin/ai-crawlers.ts`
 *   regex table + `scripts/fetch-cf-analytics.mjs` AI_BOTS substring table) — the
 *   cron list was the superset, so it's the base; ordered most-specific-token
 *   first so e.g. "Claude-SearchBot" isn't shadowed by "ClaudeBot". This single
 *   injected list is what kills the 2-file duplication.
 * - `refererChannelMap` consolidates the THREE referer/source classifiers
 *   (`fetch-cf-analytics.mjs::classifyReferer`, `traffic-sources.ts::classifySource`,
 *   the editor CTA logic). Rules are evaluated in order; first match wins. `drop`
 *   rules (internal nav, the CF Access auth redirect) suppress the source. The
 *   own-domain `yourbodyofhealth.com` needle is the one truly brand-specific
 *   value — a new domain re-points it.
 * - The CF zone/account ids that were env-literals in BoH (`CF_ZONE_ID` /
 *   `CF_ACCOUNT_ID`) are config here; the secret token stays in env.
 *
 * Every value is a knob; @jeldon/crawler-analytics falls back to this when
 * `pack.analytics` is omitted.
 */
export const defaultAnalyticsConfig: AnalyticsConfig = {
  aiBotList: [
    { match: 'OAI-SearchBot', bot: 'OAI-SearchBot', engine: 'openai', purpose: 'index' },
    { match: 'ChatGPT-User', bot: 'ChatGPT-User', engine: 'openai', purpose: 'live' },
    { match: 'GPTBot', bot: 'GPTBot', engine: 'openai', purpose: 'train' },
    { match: 'Claude-SearchBot', bot: 'Claude-SearchBot', engine: 'anthropic', purpose: 'index' },
    { match: 'Claude-User', bot: 'Claude-User', engine: 'anthropic', purpose: 'live' },
    { match: 'ClaudeBot', bot: 'ClaudeBot', engine: 'anthropic', purpose: 'train' },
    { match: 'claude-web', bot: 'claude-web', engine: 'anthropic', purpose: 'live' },
    { match: 'anthropic-ai', bot: 'anthropic-ai', engine: 'anthropic', purpose: 'train' },
    { match: 'Perplexity-User', bot: 'Perplexity-User', engine: 'perplexity', purpose: 'live' },
    { match: 'PerplexityBot', bot: 'PerplexityBot', engine: 'perplexity', purpose: 'index' },
    { match: 'Google-Extended', bot: 'Google-Extended', engine: 'google', purpose: 'train' },
    { match: 'GoogleOther', bot: 'GoogleOther', engine: 'google', purpose: 'index' },
    { match: 'Bytespider', bot: 'Bytespider', engine: 'bytedance', purpose: 'train' },
    { match: 'Amazonbot', bot: 'Amazonbot', engine: 'amazon', purpose: 'index' },
    { match: 'YouBot', bot: 'YouBot', engine: 'you', purpose: 'index' },
    { match: 'DuckAssistBot', bot: 'DuckAssistBot', engine: 'duckduckgo', purpose: 'live' },
    { match: 'MistralAI-User', bot: 'MistralAI-User', engine: 'mistral', purpose: 'live' },
    { match: 'Meta-ExternalAgent', bot: 'Meta-ExternalAgent', engine: 'meta', purpose: 'train' },
    { match: 'Applebot-Extended', bot: 'Applebot-Extended', engine: 'apple', purpose: 'train' },
    { match: 'CCBot', bot: 'CCBot', engine: 'commoncrawl', purpose: 'train' },
    { match: 'cohere-ai', bot: 'cohere-ai', engine: 'cohere', purpose: 'train' },
  ],
  refererChannelMap: [
    { needles: ['yourbodyofhealth.com'], drop: true }, // internal nav
    { needles: ['cloudflareaccess.com'], drop: true }, // admin auth redirect
    { label: 'Newsletter', needles: ['sendib', 'sendinblue', 'brevo', 'newsletter', 'email'] },
    { label: 'Google Search', needles: ['google.'] },
    { label: 'Google Business', needles: ['gbp', 'gmb', 'google-business'] },
    { label: 'Bing', needles: ['bing.'] },
    { label: 'DuckDuckGo', needles: ['duckduckgo'] },
    { label: 'Facebook', needles: ['facebook.', 'l.facebook', 'fb.com', 'fb.me', 'fb'] },
    { label: 'Instagram', needles: ['instagram', 'ig'] },
    { label: 'X / Twitter', needles: ['t.co', 'twitter', 'x.com'] },
    { label: 'LinkedIn', needles: ['linkedin', 'lnkd.in'] },
    { label: 'YouTube', needles: ['youtube', 'youtu.be'] },
    { label: 'Reddit', needles: ['reddit'] },
    { label: 'Perplexity', needles: ['perplexity'] },
    { label: 'ChatGPT', needles: ['chatgpt', 'openai'] },
    { label: 'Yelp', needles: ['yelp'] },
    { label: 'Healthgrades', needles: ['healthgrades'] },
  ],
  directLabel: 'Direct / none',
  articlePathPattern: '^/articles/([a-z0-9-]+)/?$',
  assetPathPattern:
    '^/(_astro|_image|images|img|audio|favicon|cdn-cgi|wp-cron|wp-admin|wp-login|xmlrpc|wp-content|wp-includes|.*\\.(?:css|js|png|jpe?g|webp|avif|svg|ico|mp3|xml|txt|php|woff2?))',
  botUaPattern:
    'bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|whatsapp|telegram|slack|discord|headless|monitor|uptime|python-requests|curl|wget|go-http|libwww|okhttp|axios|node-fetch|java\\/|scrapy|ahrefs|semrush|mj12|dotbot|petalbot|dataforseo|bytespider|gptbot|claudebot|ccbot|perplexity|yandex|baidu|sogou|applebot|googlebot|bingbot|duckduck',
  // Mirrors BoH `fetch-cf-analytics.mjs::SITE_ROUTE_404` (and strategy.ts). A
  // 404 on one of these survives the top-25 truncation.
  siteRoute404Patterns: [
    '^/articles/[a-z0-9-]+/?$',
    '^/conditions/[a-z0-9-]+/?$',
    '^/care/[a-z0-9-]+(/[a-z0-9-]+)?/?$',
    '^/team/[a-z0-9-]+/?$',
    '^/locations/[a-z0-9-]+/?$',
  ],
  cloudflare: {
    zoneId: '3729601f65f74d2f9d88d61d165fa1ac',
    accountId: '371ac4bfa6c0f9aa3b0de0228fb0952d',
    endpoint: 'https://api.cloudflare.com/client/v4/graphql',
  },
  windowDays: 30,
  maxDailySnapshots: 365,
};

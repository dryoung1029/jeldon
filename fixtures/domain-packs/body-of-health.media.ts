/**
 * TEST FIXTURE — the Body of Health media block (narration, hero image,
 * podcast) and competitor-scanner patterns, as they shipped in the engine's
 * defaults before extraction (docs/CONSTITUTION.md rule 1). Engine tests use
 * it as a fully-filled health/clinic pack; it is also a reference for a
 * project in that vertical. None of it is engine code.
 *
 * In a Domain Pack:
 *
 *   media: bodyOfHealthMedia,
 *   competitors: { roster, targetKeywords, ...bodyOfHealthCompetitorPatterns },
 *
 * The voice id is BoH's ElevenLabs clone and will not work for another account.
 */
import type { CompetitorsConfig, MediaConfig } from '@jeldon/config';

export const bodyOfHealthMedia: MediaConfig = {
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

/** The BoH competitor-scanner tuning: the clinic service/condition path terms
 *  and the healthcare website-vendor fingerprints. Spread into `competitors`. */
export const bodyOfHealthCompetitorPatterns: Pick<
  CompetitorsConfig,
  'highValuePatterns' | 'templateVendors'
> = {
  highValuePatterns: [
    '/(services?|treatments?|conditions?|specialt(?:y|ies)|care|therapy|therapies)/',
    '/(chiropractic|massage|acupuncture|adjust|spinal|spine|rehab|wellness|injury|pain)\\b',
    '/(back-?pain|neck-?pain|headache|migraine|sciatica|whiplash|sports?-?injur|auto-?accident|pregnan|prenatal|webster|extremit|shoulder|knee|hip|tmj|carpal|plantar|posture)',
    '/(blog|articles?|news|posts?|resources?|education)/',
  ],
  templateVendors: [
    { name: 'chiromatrix', fingerprints: ['cdcssl\\.ibsrv\\.net', 'chiromatrix'] },
    {
      name: 'solutionreach',
      fingerprints: [
        '<meta[^>]+(?:name|property)=["\']generator["\'][^>]+(?:solutionreach|sr-pulse)',
        'solutionreach\\.com',
        'sr-cdn',
      ],
    },
    { name: 'ihealth-spot', fingerprints: ['ihealthspot\\.com', 'ihealthspot-cdn'] },
  ],
};

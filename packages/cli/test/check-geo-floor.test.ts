import { describe, expect, it } from 'vitest';
import { defaultGeoConfig } from '@jeldon/config';
import { evaluateGeoFloor } from '../src/check-geo-floor.js';

// A statistic-dense, attributed, first-person article — scores high on GEO under
// the default (health) config (see @jeldon/core-scoring's own fixture).
const liveRich = `---
title: When should you actually image low back pain?
excerpt: Imaging early rarely changes the plan for uncomplicated low back pain.
category: conditions
tags: [back-pain, imaging]
heroImage: /img/lumbar.png
heroImageAlt: A clinician reviewing a lumbar spine x-ray with a patient
---
When I see a new patient with low back pain, the first question is rarely "do we image?"

## Why imaging early usually does not help

According to Chou et al (2007), routine imaging for acute low back pain does not
improve outcomes. In one cohort, 90% of adults over 50 show degenerative changes
that are clinically irrelevant.

"Routine imaging is not associated with clinically meaningful benefit" (Chou et al, 2007).

## References

Chou et al, 2007. [PubMed](https://pubmed.ncbi.nlm.nih.gov/17909209/)
`;

// A thin, unsourced article — scores low on GEO.
const liveThin = `---
title: A quick note
excerpt: Short.
category: news
draft: false
---
Just a short body with no statistics and no citations.
`;

// A draft — must be skipped, never scored.
const draftDoc = `---
title: Work in progress
category: conditions
draft: true
---
Anything at all goes here while drafting.
`;

describe('evaluateGeoFloor', () => {
  it('scores live articles, skips drafts, and flags those below their category target', () => {
    const report = evaluateGeoFloor(
      [
        { path: 'articles/rich.md', raw: liveRich },
        { path: 'articles/thin.md', raw: liveThin },
        { path: 'articles/wip.md', raw: draftDoc },
      ],
      defaultGeoConfig,
      { conditions: 50, news: 95 },
      defaultGeoConfig.floor,
    );

    expect(report.scored).toBe(2);
    expect(report.skipped).toBe(1);
    expect(report.results.find((r) => r.slug === 'rich')?.ok).toBe(true);
    expect(report.results.find((r) => r.slug === 'thin')?.ok).toBe(false);
    expect(report.failed).toBe(1);
    expect(report.ok).toBe(false);
  });

  it('falls back to the GEO floor when a category has no explicit target', () => {
    const report = evaluateGeoFloor(
      [{ path: 'articles/rich.md', raw: liveRich }],
      defaultGeoConfig,
      {}, // no category targets configured
      0, // floor backstop that everything clears
    );

    expect(report.results[0]?.target).toBe(0);
    expect(report.ok).toBe(true);
  });

  it('is config-driven: a different pack flips the verdict with no engine change', () => {
    const files = [{ path: 'articles/thin.md', raw: liveThin }];
    const strict = evaluateGeoFloor(files, defaultGeoConfig, { news: 95 }, defaultGeoConfig.floor);
    const lenient = evaluateGeoFloor(files, defaultGeoConfig, { news: 0 }, 0);

    expect(strict.ok).toBe(false);
    expect(lenient.ok).toBe(true);
  });
});

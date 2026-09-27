import { describe, expect, it } from 'vitest';
import type { Fetcher } from '@jeldon/competitive-intel';
import { analyzePage, buildScorecard, duplicateIntentGroups, measureAll, renderScorecardMarkdown, runBenchmark } from '../src/index.js';

// A stand-in for the OLD site: Webflow-ish, thin, placeholder text, stale ©,
// two URLs for one intent, no schema, "#" links, a summer special.
const OLD_HOME = `<!doctype html><html><head><title>Helix</title>
<meta content="Gym." name="description"><meta content="width=device-width" name="viewport">
<style>body{color:#777777;background:#ffffff}</style></head><body>
<nav><a href="#">Tab 1</a><a href="#">Tab 2</a><a href="/blog">Blog</a><a href="/blog-helix-training-in-corvallis-or">Blog</a></nav>
<h1>Welcome</h1><h1>Summer Special — limited time!</h1>
<p>Our members lose 20% body fat in 30 days.</p>
<img src="a.jpg"><img src="b.jpg" alt="">
<footer>© 2022 Helix</footer></body></html>`;
const OLD_SITEMAP = `<urlset><url><loc>https://old.test/</loc></url><url><loc>https://old.test/blog</loc></url><url><loc>https://old.test/blog-helix-training-in-corvallis-or</loc></url><url><loc>https://old.test/about</loc></url><url><loc>https://old.test/about-helix-training-in-corvallis-or</loc></url></urlset>`;

// The NEW site: what the kit emits.
const NEW_HOME = `<!doctype html><html lang="en"><head><title>Strength Training Gym in Corvallis, OR | Helix Training</title>
<meta name="description" content="Helix Training is a small-group strength and personal training gym in Corvallis, Oregon, owned by a Doctor of Physical Therapy. Your first class is free.">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://new.test/">
<style>:root{--fg:#23252a;--bg:#ffffff} :focus-visible{outline:3px solid} @media (prefers-reduced-motion: reduce){*{animation:none}}</style>
<script type="application/ld+json">{"@type":"LocalBusiness","name":"Helix","address":{"@type":"PostalAddress","streetAddress":"2323 NW 9th St"},"telephone":"+1-541-286-7850","openingHoursSpecification":[]}</script>
<script type="application/ld+json">{"@type":"WebSite"}</script>
<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question"},{"@type":"Question"}]}</script>
</head><body><a class="skip-link" href="#main">Skip to content</a><main id="main">
<section><h1>Get strong with people who cheer for you.</h1><p>When I coach new members, most of them worry about form first. According to the ACSM (2009), progressive strength work is safe for 95% of adults over 50 and cuts fall risk by 30% (<a href="https://acsm.org/x">source</a>). "Resistance training is safe and effective for older adults" (ACSM, 2009).</p>
<a href="https://helixtraining.pushpress.com/landing/plans/x/login">Try a free class</a></section>
<section><h2>How do I start?</h2><p>Book, meet a coach, take the class. ${'Real copy here. '.repeat(120)}</p></section>
<img src="/photos/floor.webp" alt="The gym floor during a class"><iframe src="https://www.google.com/maps/embed?x"></iframe>
<a href="tel:+15412867850">(541) 286-7850</a></main><footer>© ${new Date().getFullYear()} Helix Training</footer></body></html>`;
const NEW_SITEMAP = `<urlset><url><loc>https://new.test/</loc></url><url><loc>https://new.test/programs/</loc></url><url><loc>https://new.test/programs/personal-training/</loc></url><url><loc>https://new.test/pricing/</loc></url></urlset>`;
const NEW_SERVICE = `<!doctype html><html lang="en"><head><title>Personal Training in Corvallis, OR | Helix Training</title><meta name="description" content="Personal training at Helix Training in Corvallis — strength-based coaching from a team led by a Doctor of Physical Therapy. Movement assessment first."><meta name="viewport" content="x"><link rel="canonical" href="https://new.test/programs/personal-training/"><script type="application/ld+json">{"@type":"BreadcrumbList"}</script><script type="application/ld+json">{"@type":"Service"}</script></head><body><main><h1>Personal Training</h1><p>${'Coaching copy. '.repeat(80)}</p></main></body></html>`;

function fakeFetcher(pages: Record<string, string>): Fetcher {
  return {
    async fetchHtml(url: string) {
      const key = url.replace(/\/$/, '');
      const html = pages[key] ?? pages[`${key}/`];
      return html ? { ok: true, status: 200, finalUrl: url.endsWith('/') ? url : url + (key.split('/').length <= 3 ? '/' : ''), html, via: 'plain' as const } : { ok: false, status: 404, finalUrl: url, html: '', via: 'plain' as const };
    },
  };
}
function fakeFetch(map: Record<string, { status?: number; body?: string }>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input).replace(/\/$/, '');
    const hit = map[url] ?? map[`${url}/`];
    if (!hit) return new Response('not found', { status: 404 });
    return new Response(init?.method === 'HEAD' ? null : hit.body ?? '', { status: hit.status ?? 200 });
  }) as typeof fetch;
}

describe('duplicateIntentGroups', () => {
  it('finds keyword-stuffed twins of the same page', () => {
    const g = duplicateIntentGroups(['https://x/blog', 'https://x/blog-helix-training-in-corvallis-or', 'https://x/about', 'https://x/about-helix-training-in-corvallis-or', 'https://x/pricing']);
    expect(g).toHaveLength(2);
    expect(g.flat()).toContain('/blog-helix-training-in-corvallis-or');
  });
});

describe('analyzePage', () => {
  it('extracts the facts the ten dimensions need', () => {
    const p = analyzePage('https://new.test/', NEW_HOME, 200, { origin: 'https://new.test' });
    expect(p.h1s).toHaveLength(1);
    expect(p.schemaNap).toEqual({ address: true, telephone: true });
    expect(p.faqCount).toBe(2);
    expect(p.telLink).toBe(true);
    expect(p.mapPresent).toBe(true);
    expect(p.skipLink).toBe(true);
    expect(p.contrast).toBeGreaterThan(10);
    expect(p.bookingLinks).toHaveLength(1);
    expect(p.ctaAboveFold).toBe(true);
    expect(p.unsourcedStats).toBe(0);
    const o = analyzePage('https://old.test/', OLD_HOME, 200, { origin: 'https://old.test' });
    expect(o.h1s).toHaveLength(2);
    expect(o.hashLinks).toBe(2);
    expect(o.placeholderHits.length).toBeGreaterThan(0);
    expect(o.expiredPromos.length).toBeGreaterThan(0);
    expect(o.copyrightYear).toBe(2022);
    expect(o.unsourcedStats).toBe(1);
    expect(o.imagesWithAlt).toBe(0);
  });
});

describe('runBenchmark (no network — injected fetchers)', () => {
  it('old vs new: the kit site wins or ties every dimension, speed is unmeasured without PSI', async () => {
    const fetcher = fakeFetcher({
      'https://old.test': OLD_HOME, 'https://old.test/blog': OLD_HOME, 'https://old.test/blog-helix-training-in-corvallis-or': OLD_HOME, 'https://old.test/about': OLD_HOME, 'https://old.test/about-helix-training-in-corvallis-or': OLD_HOME,
      'https://new.test': NEW_HOME, 'https://new.test/programs': NEW_SERVICE, 'https://new.test/programs/personal-training': NEW_SERVICE, 'https://new.test/pricing': NEW_SERVICE,
    });
    const fetchImpl = fakeFetch({
      'https://old.test/sitemap.xml': { body: OLD_SITEMAP }, 'https://old.test/robots.txt': { status: 404 },
      'https://new.test/sitemap.xml': { body: NEW_SITEMAP }, 'https://new.test/robots.txt': { body: 'User-agent: *\nAllow: /' },
      'https://new.test/programs': {}, 'https://new.test/programs/personal-training': {}, 'https://new.test/pricing': {}, 'https://new.test': {},
      'https://old.test/blog': {}, 'https://old.test/blog-helix-training-in-corvallis-or': {},
    });
    const { scorecard } = await runBenchmark({ oldUrl: 'https://old.test', newUrl: 'https://new.test', fetcher, fetchImpl });
    const byId = Object.fromEntries(scorecard.rows.map((r) => [r.id, r.verdict]));
    expect(byId.speed).toBe('unmeasured');
    for (const id of ['search-hygiene', 'duplicate-urls', 'structured-data', 'citability', 'content-depth', 'conversion-path', 'accessibility', 'honesty', 'local']) {
      expect(byId[id], id).toBe('win');
    }
    expect(scorecard.behind).toBe(0);
    expect(scorecard.passes).toBe(true);
    expect(scorecard.biggestWins).toHaveLength(3);
    const md = renderScorecardMarkdown(scorecard);
    expect(md).toContain('| Duplicate-intent URLs |');
    expect(md).toContain('LAUNCH GATE PASSES');
  });

  it('a regression is "behind" and blocks the gate; a stored baseline works without the old URL', async () => {
    const snapNew = { url: 'https://new.test', origin: 'https://new.test', fetchedAt: '', sitemapFound: true, sitemapUrls: [], robotsFound: true, pages: [analyzePage('https://new.test/', NEW_HOME, 200, { origin: 'https://new.test' })], home: null as any, servicePage: null, deadLinks: [], checkedLinks: 0, psi: null, contactTest: null, errors: [] };
    snapNew.home = snapNew.pages[0]!;
    const good = measureAll(snapNew);
    const worse = measureAll({ ...snapNew, deadLinks: ['https://new.test/x (404)', 'https://new.test/y (404)', 'https://new.test/z (404)'] });
    const card = buildScorecard({ oldUrl: 'baseline', newUrl: 'https://new.test', oldMeasurements: good, newMeasurements: worse });
    expect(card.rows.find((r) => r.id === 'conversion-path')?.verdict).toBe('behind');
    expect(card.passes).toBe(false);
    expect(card.fixList.some((f) => f.includes('BEHIND') && f.includes('dead internal link'))).toBe(true);
  });
});

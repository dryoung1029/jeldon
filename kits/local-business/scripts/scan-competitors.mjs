#!/usr/bin/env node
/**
 * Competitor scan — deterministic, no API keys required.
 *   node scripts/scan-competitors.mjs            # every competitor in jeldon.config.ts + us
 *   node scripts/scan-competitors.mjs <url>...   # specific sites
 * Writes data/competitors/<id>.json plus data/competitors/summary.md.
 * Optional: PAGESPEED_API_KEY in env adds Core Web Vitals scores.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { loadDomainPack } from '@jeldon/config/load';
import { runAudit, compareAudits, scannerConfigFromPack, geoConfigFromPack, competitorsFromPack } from '@jeldon/competitive-intel';

const pack = await loadDomainPack();
const comp = competitorsFromPack(pack);
const cfg = scannerConfigFromPack(pack);
const geo = geoConfigFromPack(pack);
const pageSpeedKey = process.env.PAGESPEED_API_KEY;
const argUrls = process.argv.slice(2).filter((a) => a.startsWith('http'));

const targets = argUrls.length ? argUrls.map((url, i) => ({ id: `adhoc-${i + 1}`, name: url, url })) : (comp?.roster ?? []);
if (!targets.length) {
  console.error('No competitors configured. Add entries to competitors.roster in jeldon.config.ts or pass URLs.');
  process.exit(1);
}
await mkdir('data/competitors', { recursive: true });
const opts = { geo, scannerConfig: cfg, pageSpeedKey, skipPageSpeed: !pageSpeedKey, pageSampleLimit: 12 };

console.log(`Auditing us: ${pack.brand.siteUrl}`);
const us = await runAudit({ url: pack.brand.siteUrl, ...opts }).catch((e) => {
  console.warn('  (could not audit our own site yet — fine before launch):', e.message);
  return null;
});
if (us) await writeFile('data/competitors/_us.json', JSON.stringify(us, null, 2));

const lines = [`# Competitor scan — ${new Date().toISOString().slice(0, 10)}`, ''];
if (us?.homepage) lines.push(`**Us (${pack.brand.siteUrl})** — GEO ${us.homepage.geoScore}, ${us.homepage.wordCount} words, schema types: ${us.schemaOrg?.types.join(', ') || 'none'}`, '');

for (const t of targets) {
  console.log(`Auditing ${t.name} (${t.url})`);
  try {
    const them = await runAudit({ url: t.url, placeId: t.placeId, ...opts });
    await writeFile(`data/competitors/${t.id}.json`, JSON.stringify(them, null, 2));
    const gaps = compareAudits(us, them);
    const h = them.homepage;
    lines.push(`## ${t.name}`, `- URL: ${t.url}`);
    if (h) {
      lines.push(
        `- Title: ${h.title ?? '(none)'}`,
        `- Meta description: ${h.metaDescription ? 'yes' : 'MISSING'}`,
        `- Homepage GEO (citability) score: ${h.geoScore}`,
        `- Words on homepage: ${h.wordCount} · H1s: ${h.h1.length} · H2s: ${h.h2Count}`,
        `- Blog: ${h.hasBlogHint ? 'yes' : 'no'} · FAQ: ${h.hasFaqHint ? 'yes' : 'no'} · Team page: ${h.hasTeamHint ? 'yes' : 'no'}`,
      );
    }
    lines.push(
      // templateVendor is a string (the Helix script read `.name` and always printed "unknown").
      `- Template/vendor: ${them.templateVendor ?? 'unknown'}`,
      `- Schema.org types: ${them.schemaOrg?.types.join(', ') || 'none'}`,
      `- Sitemap: ${them.sitemap?.found ? 'yes' : 'no'} · robots.txt: ${them.robots?.found ? 'yes' : 'no'}`,
      them.pageSpeed ? `- PageSpeed (mobile): ${JSON.stringify(them.pageSpeed.mobile ?? them.pageSpeed)}` : '',
      them.pageStats ? `- Sampled pages: ${them.pages.length}, thin pages: ${them.pageStats.thinPageCount}` : '',
      them.errors.length ? `- Errors: ${them.errors.join('; ')}` : '',
    );
    if (gaps.length) {
      lines.push('', '| Signal | Us | Them | Edge |', '|---|---|---|---|');
      for (const g of gaps) lines.push(`| ${g.label} | ${g.us} | ${g.them} | ${g.advantage} |`);
    }
    lines.push('');
  } catch (e) {
    lines.push(`## ${t.name}`, `- Failed: ${e.message}`, '');
    console.warn(`  failed: ${e.message}`);
  }
}
await writeFile('data/competitors/summary.md', lines.filter((l) => l !== undefined && l !== '').join('\n') + '\n');
console.log('\nWrote data/competitors/summary.md (+ one JSON per site).');

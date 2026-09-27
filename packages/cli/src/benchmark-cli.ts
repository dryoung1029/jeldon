/**
 * `jeldon benchmark --old <url> --new <url> [--psi] [--test-contact]`
 * `jeldon benchmark --old <url>              store the baseline only`
 * `jeldon benchmark --ci [--new <url>]       compare NEW to data/benchmark/baseline.json; exit 1 on any behind`
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { captureBaseline, renderScorecardMarkdown, runBenchmark, buildScorecard, type Baseline } from '@jeldon/benchmark';
import { loadDomainPack } from '@jeldon/config/load';

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function runBenchmarkCli(args: string[]): Promise<number> {
  const cwd = process.cwd();
  const oldUrl = flag(args, '--old');
  let newUrl = flag(args, '--new');
  const ci = args.includes('--ci');
  const psi = args.includes('--psi') || Boolean(process.env.PAGESPEED_API_KEY);
  const testContact = args.includes('--test-contact');
  const json = args.includes('--json');
  const outDir = resolve(cwd, flag(args, '--out') ?? 'data/benchmark');
  mkdirSync(outDir, { recursive: true });
  const log = json ? () => undefined : (l: string) => console.log(l);

  // Pack-aware options when run inside a project.
  let geo, geoTargets, servicePrefixHints: string[] | undefined, articlePrefix: string | undefined, gbp;
  try {
    const pack = await loadDomainPack({ cwd });
    geo = pack.scoring.geo;
    geoTargets = { home: Math.max(50, pack.scoring.geo.floor - 20), article: pack.scoring.geo.floor };
    articlePrefix = pack.content.articlePathPrefix;
    gbp = { street: pack.brand.nap?.address, phone: pack.brand.nap?.phone };
    servicePrefixHints = pack.scoring.seo.internalLinkPrefixes.filter((p) => !/^(blog|articles|team|coaches|pricing|schedule|faq|contact|about)$/.test(p)).map((p) => `/${p}/`);
    if (!newUrl && ci) newUrl = pack.brand.siteUrl;
  } catch {
    /* outside a project: URLs only */
  }

  const baselinePath = join(outDir, 'baseline.json');

  if (oldUrl && !newUrl && !ci) {
    log(`Capturing baseline for ${oldUrl}…`);
    const { baseline, measurements } = await captureBaseline(oldUrl, { psi, psiKey: process.env.PAGESPEED_API_KEY, geo, geoTargets, gbp, articlePrefix, log });
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
    const card = buildScorecard({ oldUrl, newUrl: oldUrl, oldMeasurements: null, newMeasurements: measurements });
    writeFileSync(join(outDir, 'baseline-scorecard.md'), renderScorecardMarkdown({ ...card, oldUrl: null }).replace('# Benchmark scorecard', '# Baseline scorecard (the OLD site)'));
    if (json) console.log(JSON.stringify(baseline.measurements, null, 2));
    else log(`✔ baseline stored: ${baselinePath}`);
    return 0;
  }

  if (!newUrl) {
    console.error('Usage: jeldon benchmark --old <url> --new <url> | --old <url> | --ci [--new <url>]  [--psi] [--test-contact] [--json]');
    return 1;
  }

  let baseline: Baseline | null = null;
  if (!oldUrl) {
    if (!existsSync(baselinePath)) {
      console.error(`No baseline at ${baselinePath}. Run \`jeldon benchmark --old <url>\` first (jeldon init does this).`);
      return 1;
    }
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline;
  }

  const result = await runBenchmark({ oldUrl, newUrl, baseline, psi, psiKey: process.env.PAGESPEED_API_KEY, geo, geoTargets, gbp, testContact, servicePrefixHints, articlePrefix, log });
  const card = result.scorecard;
  const date = card.generatedAt.slice(0, 10);
  writeFileSync(join(outDir, `scorecard-${date}.md`), renderScorecardMarkdown(card));
  writeFileSync(join(outDir, 'latest.json'), JSON.stringify({ scorecard: card, newMeasurements: result.newMeasurements, oldMeasurements: result.oldMeasurements }, null, 2));
  if (json) console.log(JSON.stringify(card, null, 2));
  else {
    console.log(renderScorecardMarkdown(card));
    console.log(`Wrote ${join(outDir, `scorecard-${date}.md`)} and latest.json`);
  }
  if (ci && !card.passes) {
    console.error(`✖ benchmark: ${card.behind} dimension(s) behind the baseline — launch blocked.`);
    return 1;
  }
  return 0;
}

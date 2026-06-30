import { readFile, readdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { loadDomainPack, type GeoConfig } from '@jeldon/config';
import { calculateGeo } from '@jeldon/core-scoring';
import { parse, isLive, type Frontmatter, type LifecycleFlags } from '@jeldon/content-model';

export interface GeoFloorResult {
  slug: string;
  /** Absolute path of the scored file. */
  file: string;
  category: string;
  score: number;
  /** The category target the score is checked against (GEO floor as backstop). */
  target: number;
  ok: boolean;
}

export interface GeoFloorReport {
  results: GeoFloorResult[];
  /** Live articles actually scored (drafts excluded). */
  scored: number;
  /** Draft articles skipped. */
  skipped: number;
  failed: number;
  ok: boolean;
}

/** Default content directory when `services.contentDir` is omitted — matches the
 *  template scaffold and the historical BoH layout. */
const DEFAULT_CONTENT_DIR = 'src/content/articles';

/** Frontmatter values are loosely typed; lifecycle flags are strict booleans.
 *  Coerce at the boundary so `isLive` stays the single lifecycle authority and
 *  this command never re-implements the "is it published?" predicate. */
function toLifecycleFlags(fm: Frontmatter): LifecycleFlags {
  return {
    draft: fm.draft === true,
    docReviewed: fm.docReviewed === true,
    ready: fm.ready === true,
    scheduled: fm.scheduled === true,
  };
}

/**
 * Pure GEO-floor evaluation. Parses each file, skips drafts, and scores every
 * live article with the SAME `@jeldon/core-scoring` the editor dial uses — no
 * mirrored scoring logic. An article fails when its GEO score is below its
 * category target; the GEO floor is the backstop for categories with no explicit
 * target. No I/O, so the threshold logic is unit-testable without a config file.
 */
export function evaluateGeoFloor(
  files: Array<{ path: string; raw: string }>,
  geo: GeoConfig,
  targets: Record<string, number>,
  floor: number,
): GeoFloorReport {
  const results: GeoFloorResult[] = [];
  let skipped = 0;

  for (const { path, raw } of files) {
    const { frontmatter, body } = parse(raw);

    // Only score articles that ship publicly. Drafts are work-in-progress.
    if (!isLive(toLifecycleFlags(frontmatter))) {
      skipped++;
      continue;
    }

    const slug = basename(path, '.md');
    const { score } = calculateGeo(
      {
        title: String(frontmatter.title ?? ''),
        excerpt: String(frontmatter.excerpt ?? ''),
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
        body,
        slug,
        heroImage: typeof frontmatter.heroImage === 'string' ? frontmatter.heroImage : undefined,
        heroImageAlt:
          typeof frontmatter.heroImageAlt === 'string' ? frontmatter.heroImageAlt : undefined,
      },
      geo,
    );

    const category = String(frontmatter.category ?? '');
    const target = targets[category] ?? floor;
    results.push({ slug, file: path, category, score, target, ok: score >= target });
  }

  const failed = results.filter((r) => !r.ok).length;
  return { results, scored: results.length, skipped, failed, ok: failed === 0 };
}

/**
 * The Node I/O shell around {@link evaluateGeoFloor}: load the Domain Pack,
 * resolve the article set (explicit `.md` args, else every `.md` under
 * `services.contentDir`), read them, and evaluate. This is the same scorer and
 * the same thresholds the `check-geo-floor.mjs` template CI step runs, exposed
 * as a first-class CLI command so consumers can drop the script.
 */
export async function runCheckGeoFloor(
  opts: { cwd?: string; files?: string[] } = {},
): Promise<GeoFloorReport> {
  const cwd = opts.cwd ?? process.cwd();
  const pack = await loadDomainPack({ cwd });
  const contentDir = resolve(cwd, pack.services.contentDir ?? DEFAULT_CONTENT_DIR);

  const paths = await resolveArticlePaths(cwd, contentDir, opts.files ?? []);
  const files = await Promise.all(
    paths.map(async (path) => ({ path, raw: await readFile(path, 'utf8') })),
  );

  return evaluateGeoFloor(
    files,
    pack.scoring.geo,
    pack.content.categoryTargets,
    pack.scoring.geo.floor,
  );
}

async function resolveArticlePaths(
  cwd: string,
  contentDir: string,
  args: string[],
): Promise<string[]> {
  const explicit = args.filter((a) => a.endsWith('.md'));
  if (explicit.length) return explicit.map((f) => resolve(cwd, f));
  const entries = await readdir(contentDir);
  return entries
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => resolve(contentDir, f));
}

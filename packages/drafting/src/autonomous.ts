/**
 * runAutonomousDrafts — unattended drafting from a research digest.
 *
 * Port of Body of Health `scripts/fetch-cite8-digest.mjs`: digest → relevance
 * filter (service/topic fit AND a competitor priority keyword) → coverage
 * de-dupe → strongest evidence first → `draft()` (which runs the same
 * score → verify → fix-pass loop as any human-driven draft) → save with
 * `draft: true` + `autonomous: true`. A hard cap bounds each run; qualifying
 * leftovers are reported as a notice, not silently dropped and not carried
 * forward.
 *
 * The runner NEVER publishes: whatever the model wrote, the saved file says
 * `draft: true`. It also never overwrites an existing article.
 *
 * The digest is behind `ResearchDigestSource` (@jeldon/verify). `cite8` is one
 * adapter; a host can supply any other.
 */

import { defaultAutonomousDraftingConfig, mentionsTerm, type AutonomousDraftingConfig } from '@jeldon/config';
import type { Store } from '@jeldon/store';
import type { DigestDocument, ResearchDigestSource, VerificationReport } from '@jeldon/verify';
import { draft, type DraftDeps } from './draft.js';
import type { DraftEvent, ScorePair } from './types.js';

export interface AutonomousDeps {
  /** Everything `draft()` needs (provider, pack, prompts, knowledge, verifier, codec, today). */
  draft: DraftDeps;
  source: ResearchDigestSource;
  /** Where drafts land. `listArticles` guards against overwriting an existing slug. */
  store: Pick<Store, 'listArticles' | 'saveArticle'>;
  /** Competitor priority keyword phrases (e.g. `KnowledgeProviders.priorityKeywords`). */
  priorityKeywords?: () => Promise<string[]>;
  /** Lowercased text of the existing catalog for the coverage check. */
  coverageText?: () => Promise<string>;
  /** Model alias for the drafts. Default: `drafting.defaultModel`. */
  model?: string;
}

export interface DigestRelevance {
  topicHit: string | null;
  keywordHit: string | null;
  qualifies: boolean;
}

export interface AutonomousDraftOutcome {
  slug: string;
  documentId: string;
  title: string;
  keywordHit: string | null;
  topicHit: string | null;
  evidenceLevel: number | null;
  scores: ScorePair | null;
  verification: VerificationReport | null;
}

export type AutonomousRunResult =
  | { status: 'not_configured'; reason: string }
  | { status: 'source_error'; reason: string }
  | {
      status: 'ran';
      /** Documents the digest returned. */
      documents: number;
      /** Upstream total and whether the digest itself was truncated. */
      total: number;
      truncated: boolean;
      /** Documents that passed relevance + coverage, strongest evidence first. */
      qualifying: number;
      drafted: AutonomousDraftOutcome[];
      failed: Array<{ documentId: string; title: string; error: string }>;
      /** Qualifying documents not attempted because of the per-run cap. */
      leftover: number;
      cap: number;
      /** Human-facing lines; the template cron prints them as `::notice::`. */
      notices: string[];
      /** Degraded-input lines; printed as `::warning::`. */
      warnings: string[];
    };

/** Text the relevance filter reads off a digest document. */
function docText(doc: DigestDocument): string {
  return [doc.title, doc.corpus, ...(doc.domains ?? [])].filter(Boolean).join(' ');
}

/**
 * BoH `scoreRelevance`, with word-boundary matching (`mentionsTerm`) in place
 * of BoH's bare `includes()`. A domain that wants plurals lists them.
 */
export function scoreDigestRelevance(
  doc: DigestDocument,
  relevance: AutonomousDraftingConfig['relevance'],
  priorityKeywords: string[],
): DigestRelevance {
  const text = docText(doc);
  const topicHit = relevance.topics.find((t) => mentionsTerm(text, t)) ?? null;
  const keywordHit = priorityKeywords.find((k) => mentionsTerm(text, k)) ?? null;
  const qualifies =
    (!relevance.requireTopic || topicHit !== null) &&
    (!relevance.requirePriorityKeyword || keywordHit !== null);
  return { topicHit, keywordHit, qualifies };
}

/**
 * Force the saved file to be an unpublished, autonomous draft: `draft: true`
 * (replacing any `draft: false` the model wrote, inserting it when absent) and
 * `autonomous: true`. Returns null when there is no frontmatter block to mark,
 * so the caller refuses to save rather than writing an unmarked file.
 */
export function markAutonomousDraft(content: string): string | null {
  const m = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!m) return null;
  let fm = m[2] ?? '';
  if (/^draft:.*$/m.test(fm)) fm = fm.replace(/^draft:.*$/m, 'draft: true');
  else fm = `${fm}\ndraft: true`;
  if (/^autonomous:.*$/m.test(fm)) fm = fm.replace(/^autonomous:.*$/m, 'autonomous: true');
  else fm = fm.replace(/^draft: true$/m, 'draft: true\nautonomous: true');
  return `${m[1]}${fm}${m[3]}${content.slice(m[0].length)}`;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? vars[k]! : all));
}

/** The per-document drafting prompt. Built from the pack + the document; no domain literal. */
export function buildDigestPrompt(
  doc: DigestDocument,
  cfg: AutonomousDraftingConfig,
  brandName: string,
): string {
  const identifiers = Object.entries(doc.identifiers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const vars = {
    title: doc.title,
    journal: doc.journal || 'unknown',
    year: doc.year != null ? String(doc.year) : 'unknown',
    identifiers: identifiers || '(none supplied)',
    url: doc.url ?? '',
    evidence: doc.evidenceLevel != null ? String(doc.evidenceLevel) : 'unclassified',
    brand: brandName,
    category: cfg.category ?? '',
  };
  if (cfg.promptTemplate) return fill(cfg.promptTemplate, vars);
  return `Draft a short evidence-focused article${cfg.category ? ` (category: ${cfg.category})` : ''} built around this newly ingested, verifiable source:

Title: ${vars.title}
Journal: ${vars.journal} (${vars.year})
${vars.identifiers}${vars.url ? `\nLink: ${vars.url}` : ''}
Evidence level (1 = strongest): ${vars.evidence}

Ground the article in what this source actually found and cite it directly. The identifiers above come from the research source itself: use them as given, and do not add identifiers for supporting claims beyond what the citation verifier confirms. Connect the article to a relevant existing page on ${brandName}'s site. Follow the standing voice rules and the drafting playbook exactly as with any other draft.`;
}

const evidenceRank = (d: DigestDocument) => (typeof d.evidenceLevel === 'number' ? d.evidenceLevel : 99);

export async function runAutonomousDrafts(deps: AutonomousDeps): Promise<AutonomousRunResult> {
  const pack = deps.draft.pack;
  const configured = pack.drafting?.autonomous;
  if (!configured || configured.source === 'none') {
    return { status: 'not_configured', reason: 'drafting.autonomous is not configured (or its source is "none").' };
  }
  const cfg: AutonomousDraftingConfig = {
    ...defaultAutonomousDraftingConfig,
    ...configured,
    relevance: { ...defaultAutonomousDraftingConfig.relevance, ...configured.relevance },
  };

  const digest = await deps.source.fetchDigest({ days: cfg.digestDays });
  if (digest.status === 'not_configured') return { status: 'not_configured', reason: digest.reason };
  if (digest.status === 'error') return { status: 'source_error', reason: digest.reason };

  const warnings: string[] = [];
  const notices: string[] = [];
  if (digest.truncated) {
    warnings.push(
      `The ${deps.source.kind} digest reports it was truncated upstream (total ${digest.total}); some documents in this window were not returned.`,
    );
  }

  const [keywords, coverage, listing] = await Promise.all([
    deps.priorityKeywords ? deps.priorityKeywords().catch(() => []) : Promise.resolve([] as string[]),
    deps.coverageText ? deps.coverageText().catch(() => '') : Promise.resolve(''),
    deps.store.listArticles(),
  ]);
  if (cfg.relevance.requireTopic && !cfg.relevance.topics.length) {
    warnings.push('drafting.autonomous.relevance.topics is empty while requireTopic is on; nothing can qualify.');
  }
  if (cfg.relevance.requirePriorityKeyword && !keywords.length) {
    warnings.push('No priority keywords are available while requirePriorityKeyword is on; nothing can qualify.');
  }
  const coverageLc = coverage.toLowerCase();
  const existing = new Set(listing.map((l) => l.slug));

  const qualifying = digest.documents
    .map((doc) => ({ doc, ...scoreDigestRelevance(doc, cfg.relevance, keywords) }))
    .filter((c) => c.qualifies)
    .filter((c) => {
      const prefix = c.doc.title.toLowerCase().slice(0, cfg.coverageTitleChars);
      return !(coverageLc && prefix && coverageLc.includes(prefix));
    })
    .sort((a, b) => evidenceRank(a.doc) - evidenceRank(b.doc));

  const cap = Math.max(0, cfg.maxDraftsPerRun);
  const batch = qualifying.slice(0, cap);
  const leftover = qualifying.length - batch.length;
  if (leftover > 0) {
    notices.push(
      `${leftover} qualifying document(s) not drafted this run (over the ${cap}/run cap). They are not carried forward; they need the next digest window or a manual pass.`,
    );
  }

  const drafted: AutonomousDraftOutcome[] = [];
  const failed: Array<{ documentId: string; title: string; error: string }> = [];
  for (const c of batch) {
    const fail = (error: string) => failed.push({ documentId: c.doc.id, title: c.doc.title, error });
    try {
      const result = await collect(
        draft(
          {
            mode: 'draft',
            messages: [{ role: 'user', content: buildDigestPrompt(c.doc, cfg, pack.brand.name) }],
            model: deps.model,
          },
          deps.draft,
        ),
      );
      if ('error' in result) {
        fail(result.error);
        continue;
      }
      const d = result.draft;
      if (!d?.slug || !d.content) {
        fail('draft() returned no draft');
        continue;
      }
      if (existing.has(d.slug)) {
        fail(`slug "${d.slug}" already exists; refusing to overwrite it`);
        continue;
      }
      const marked = markAutonomousDraft(d.content);
      if (!marked) {
        fail('draft has no frontmatter block; refusing to save an unmarked file');
        continue;
      }
      const ids = Object.entries(c.doc.identifiers).map(([k, v]) => `${k} ${v}`).join(', ');
      await deps.store.saveArticle(
        d.slug,
        marked,
        null,
        `auto: ${deps.source.kind}-digest draft ${d.slug}${ids ? ` (${ids})` : ''}`,
      );
      existing.add(d.slug);
      drafted.push({
        slug: d.slug,
        documentId: c.doc.id,
        title: c.doc.title,
        keywordHit: c.keywordHit,
        topicHit: c.topicHit,
        evidenceLevel: c.doc.evidenceLevel ?? null,
        scores: result.scores ?? null,
        verification: result.verification ?? null,
      });
    } catch (err) {
      fail((err as Error).message);
    }
  }

  if (drafted.length) {
    notices.push(`Created ${drafted.length} autonomous draft(s) for review: ${drafted.map((d) => d.slug).join(', ')}`);
  }

  return {
    status: 'ran',
    documents: digest.documents.length,
    total: digest.total,
    truncated: digest.truncated,
    qualifying: qualifying.length,
    drafted,
    failed,
    leftover,
    cap,
    notices,
    warnings,
  };
}

type DraftResultEvent = Extract<DraftEvent, { type: 'result' }>;

/** Drain a draft() generator into its terminal event. */
async function collect(
  gen: AsyncGenerator<DraftEvent>,
): Promise<DraftResultEvent | { error: string }> {
  let out: DraftResultEvent | { error: string } = { error: 'draft() ended without a result' };
  for await (const ev of gen) {
    if (ev.type === 'result') out = ev;
    else if (ev.type === 'error') out = { error: ev.error };
  }
  return out;
}

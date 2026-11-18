import { defaultOpsConfig, type OpsGrading, type OpsPipeline, type OpsPipelineRun } from '@jeldon/config';
import { DAY_MS, parseTime, round1, toMs } from './time.js';

/**
 * Pipeline freshness. Exists because crons exit green when their secrets are
 * missing ("silent skip"); grading every cron-fed file against its cadence is
 * what turns a silently dead pipeline into a visible red chip.
 *
 * - `ok`    age <= cadence × grading.lateMultiplier
 * - `late`  age <= cadence × grading.staleMultiplier
 * - `stale` older than that
 * - `never` no timestamp at all (the writer has never written)
 * - `unattestable` a timestamp exists but cannot prove liveness: it does not
 *   parse, or the file is change-gated and carries no check stamp.
 */
export type FreshnessStatus = 'ok' | 'late' | 'stale' | 'never' | 'unattestable';

/** Plain input for one pipeline. */
export interface PipelineEntry {
  name: string;
  cadenceDays: number;
  /** When the data file was last written. */
  lastUpdated: string | null | undefined;
  /**
   * Present only for change-gated files (the writer rewrites the data only when
   * it changes). `checkedAt` MUST be stamped by the same step that owns the
   * file, on every successful run. A stamp from any other step (even one in the
   * same workflow, with its own credentials) keeps reporting healthy while this
   * step silently skips. A change-gated entry without `checkedAt` is graded
   * `unattestable`, never `ok`: the data's age only says when it last changed.
   */
  changeGated?: { checkedAt: string | null | undefined; checkCadenceDays: number };
}

export interface ChangeGatedFreshness {
  checkedAt: string | null;
  checkedAgeDays: number | null;
  /** The check itself is current. Only then may a UI say "this step IS
   *  running"; a stale proof means the step appears to have stopped. */
  provenFresh: boolean;
  dataChangedAt: string;
}

export interface PipelineFreshness {
  name: string;
  cadenceDays: number;
  lastUpdated: string | null;
  /** Age of the data, 1 dp. null when never written or unparseable. */
  ageDays: number | null;
  status: FreshnessStatus;
  /** Why the status is `unattestable` (or `never`). */
  reason?: string;
  changeGated?: ChangeGatedFreshness;
}

/** Grade an age against a cadence. */
export function gradeAge(
  ageDays: number,
  cadenceDays: number,
  grading: OpsGrading = defaultOpsConfig.grading,
): 'ok' | 'late' | 'stale' {
  if (ageDays <= cadenceDays * grading.lateMultiplier) return 'ok';
  if (ageDays <= cadenceDays * grading.staleMultiplier) return 'late';
  return 'stale';
}

export function pipelineStatus(
  entry: PipelineEntry,
  now: Date | number = Date.now(),
  grading: OpsGrading = defaultOpsConfig.grading,
): PipelineFreshness {
  const nowMs = toMs(now);
  const base = { name: entry.name, cadenceDays: entry.cadenceDays };
  if (!entry.lastUpdated) {
    return { ...base, lastUpdated: null, ageDays: null, status: 'never', reason: 'no timestamp: the writer has never written this file' };
  }
  const t = parseTime(entry.lastUpdated);
  if (t === null) {
    return {
      ...base,
      lastUpdated: entry.lastUpdated,
      ageDays: null,
      status: 'unattestable',
      reason: `timestamp "${entry.lastUpdated}" does not parse`,
    };
  }
  const age = (nowMs - t) / DAY_MS;
  const ageDays = round1(age);

  if (entry.changeGated) {
    const { checkedAt, checkCadenceDays } = entry.changeGated;
    const c = parseTime(checkedAt);
    if (c === null) {
      return {
        ...base,
        lastUpdated: entry.lastUpdated,
        ageDays,
        status: 'unattestable',
        reason: checkedAt
          ? `check stamp "${checkedAt}" does not parse`
          : 'change-gated file has no checkedAt from the step that owns it; the data age only says when the data last changed, not whether the step still runs',
        changeGated: { checkedAt: checkedAt ?? null, checkedAgeDays: null, provenFresh: false, dataChangedAt: entry.lastUpdated },
      };
    }
    const checkedAge = (nowMs - c) / DAY_MS;
    // A fresh check clears the alarm (old data is just unchanged data). A stale
    // check means the step itself stopped: grade on the CHECK's age.
    const status = gradeAge(checkedAge, checkCadenceDays, grading);
    return {
      ...base,
      lastUpdated: entry.lastUpdated,
      ageDays,
      status,
      changeGated: {
        checkedAt: checkedAt as string,
        checkedAgeDays: round1(checkedAge),
        provenFresh: status === 'ok',
        dataChangedAt: entry.lastUpdated,
      },
    };
  }

  return { ...base, lastUpdated: entry.lastUpdated, ageDays, status: gradeAge(age, entry.cadenceDays, grading) };
}

/** A configured pipeline graded against its data file. */
export interface PipelineReport extends PipelineFreshness {
  id: string;
  file: string;
  source: string;
  run?: OpsPipelineRun;
}

/**
 * Read a data file's parsed JSON. Return `undefined` when the file does not
 * exist; throw when it exists but cannot be read or parsed (that becomes
 * `unattestable`, not `never`).
 */
export type DataFileReader = (file: string) => unknown;

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function fieldValue(data: unknown, field: string): { value: string | null } | { bad: string } {
  const v = getPath(data, field);
  if (v === undefined || v === null || v === '') return { value: null };
  if (typeof v !== 'string') return { bad: `field "${field}" is ${typeof v}, not an ISO timestamp string` };
  return { value: v };
}

/** Grade every pipeline in `ops.pipelines`, reading each file through `read`.
 *  The change-gated check stamp is always read from the pipeline's own file. */
export function gradePipelines(
  pipelines: OpsPipeline[],
  read: DataFileReader,
  now: Date | number = Date.now(),
  grading: OpsGrading = defaultOpsConfig.grading,
): PipelineReport[] {
  return pipelines.map((p) => {
    const meta = { id: p.id, file: p.file, source: p.source, ...(p.run ? { run: p.run } : {}) };
    const fail = (reason: string): PipelineReport => ({
      ...meta,
      name: p.name,
      cadenceDays: p.cadenceDays,
      lastUpdated: null,
      ageDays: null,
      status: 'unattestable',
      reason,
    });
    let data: unknown;
    try {
      data = read(p.file);
    } catch (err) {
      return fail(`could not read ${p.file}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (data === undefined) {
      return { ...meta, ...pipelineStatus({ name: p.name, cadenceDays: p.cadenceDays, lastUpdated: null }, now, grading), reason: `${p.file} does not exist` };
    }
    const last = fieldValue(data, p.timestampField);
    if ('bad' in last) return fail(last.bad);
    let changeGated: PipelineEntry['changeGated'];
    if (p.changeGated) {
      const checked = fieldValue(data, p.changeGated.checkedAtField ?? 'checkedAt');
      if ('bad' in checked) return fail(checked.bad);
      changeGated = { checkedAt: checked.value, checkCadenceDays: p.changeGated.checkCadenceDays };
    }
    return {
      ...meta,
      ...pipelineStatus({ name: p.name, cadenceDays: p.cadenceDays, lastUpdated: last.value, changeGated }, now, grading),
    };
  });
}

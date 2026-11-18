import { defaultOpsDispatchTiming, type OpsDispatch } from '@jeldon/config';
import { parseTime, toMs } from './time.js';

/**
 * GitHub Actions dispatch: run a cron-fed data workflow on demand and follow
 * the run it started. Only workflows on the allowlist can be dispatched or
 * read; list data refreshers only, never anything that publishes, sends or
 * deploys.
 *
 * The token must carry the "Actions: Read and write" repository permission
 * (fine-grained PAT) in addition to Contents. Without it GitHub answers 403,
 * or 404 because it hides resources the token cannot see; both are reported
 * with the fix named.
 */

export interface WorkflowRun {
  id: number;
  /** queued | in_progress | completed */
  status: string;
  /** success | failure | cancelled | … (null until completed) */
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
  /** workflow_dispatch | schedule | push */
  event: string;
}

export class WorkflowNotAllowedError extends Error {
  constructor(
    readonly workflow: string,
    readonly allowlist: readonly string[],
  ) {
    super(`workflow "${workflow}" is not dispatchable; allowed: ${allowlist.length ? allowlist.join(', ') : '(none configured)'}`);
    this.name = 'WorkflowNotAllowedError';
  }
}

export class ActionsApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** true when the status means the token lacks the Actions permission. */
    readonly permission: boolean,
  ) {
    super(message);
    this.name = 'ActionsApiError';
  }
}

/** The error text for a failed Actions call. 403/404 name the token fix. */
export function actionsPermissionHint(status: number, body: string, tokenName = 'GITHUB_TOKEN'): string {
  const scope =
    status === 403 || status === 404
      ? ` The ${tokenName} fine-grained token needs the "Actions: Read and write" repository permission (Contents alone is not enough). Edit the token on GitHub, then redeploy so the server sees it.`
      : '';
  return `GitHub Actions API ${status}.${scope} ${body.slice(0, 300)}`.trim();
}

export interface ActionsClientOptions {
  owner: string;
  repo: string;
  /** Branch the workflow runs on. */
  ref: string;
  token: string;
  /** `ops.dispatch.allowlist`. */
  allowlist: readonly string[];
  fetch?: typeof fetch;
  /** Default `https://api.github.com` (GitHub Enterprise: your API base). */
  apiBase?: string;
  /** Env var name quoted in permission errors. Default `GITHUB_TOKEN`. */
  tokenName?: string;
  /** Default `jeldon-ops`. */
  userAgent?: string;
}

export interface ActionsClient {
  /** POST a `workflow_dispatch`. Resolves once GitHub accepts it (204). */
  dispatchWorkflow(workflow: string): Promise<{ workflow: string; dispatchedAt: string; runsUrl: string }>;
  /** Most recent runs of the workflow on `ref`, newest first. */
  recentRuns(workflow: string, perPage?: number): Promise<WorkflowRun[]>;
  latestRun(workflow: string): Promise<WorkflowRun | null>;
  runsUrl(workflow: string): string;
}

function toRun(r: Record<string, unknown>): WorkflowRun {
  return {
    id: Number(r.id),
    status: String(r.status ?? ''),
    conclusion: (r.conclusion as string | null | undefined) ?? null,
    htmlUrl: String(r.html_url ?? ''),
    createdAt: String(r.created_at ?? ''),
    event: String(r.event ?? ''),
  };
}

export function createActionsClient(opts: ActionsClientOptions): ActionsClient {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const base = (opts.apiBase ?? 'https://api.github.com').replace(/\/$/, '');
  const allowed = new Set(opts.allowlist);
  const tokenName = opts.tokenName ?? 'GITHUB_TOKEN';

  const guard = (workflow: string): string => {
    if (!allowed.has(workflow)) throw new WorkflowNotAllowedError(workflow, [...allowed]);
    return workflow;
  };
  const api = (path: string, init: RequestInit = {}) =>
    doFetch(`${base}/repos/${encodeURIComponent(opts.owner)}/${encodeURIComponent(opts.repo)}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${opts.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': opts.userAgent ?? 'jeldon-ops',
        ...((init.headers as Record<string, string> | undefined) ?? {}),
      },
    });
  const fail = async (res: Response): Promise<never> => {
    const body = await res.text().catch(() => '');
    throw new ActionsApiError(res.status, actionsPermissionHint(res.status, body, tokenName), res.status === 403 || res.status === 404);
  };
  const runsUrl = (workflow: string) => `https://github.com/${opts.owner}/${opts.repo}/actions/workflows/${workflow}`;
  const recentRuns = async (workflow: string, perPage = 5): Promise<WorkflowRun[]> => {
    guard(workflow);
    const res = await api(
      `/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=${perPage}&branch=${encodeURIComponent(opts.ref)}`,
    );
    if (!res.ok) await fail(res);
    const data = (await res.json()) as { workflow_runs?: Array<Record<string, unknown>> };
    return (data.workflow_runs ?? []).map(toRun);
  };

  return {
    runsUrl,
    recentRuns,
    latestRun: async (workflow) => (await recentRuns(workflow, 1))[0] ?? null,
    async dispatchWorkflow(workflow) {
      guard(workflow);
      const res = await api(`/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: opts.ref }),
      });
      if (res.status !== 204) await fail(res);
      return { workflow, dispatchedAt: new Date().toISOString(), runsUrl: runsUrl(workflow) };
    },
  };
}

export interface FindRunOptions {
  /** When the user clicked (before the dispatch call). */
  clickTime: Date | number;
  /** Runs created more than this before the click are the previous run.
   *  Default 90 s. */
  slackSeconds?: number;
  /** Id of the latest run read BEFORE dispatching. The id is the real guard;
   *  the timestamp backs it up when that pre-read failed. */
  previousRunId?: number | null;
}

/**
 * The run a click started, or null if GitHub has not surfaced it yet.
 * Dispatch is asynchronous: for a few seconds "latest run" is still the
 * previous one, which (if it finished moments ago) would otherwise read as
 * done instantly. A run is ours only if it is not the pre-read run and was not
 * created before the click (minus slack). Returns the newest qualifying run.
 */
export function findRunAfter(runs: WorkflowRun[] | WorkflowRun | null | undefined, opts: FindRunOptions): WorkflowRun | null {
  const list = runs == null ? [] : Array.isArray(runs) ? runs : [runs];
  const floor = toMs(opts.clickTime) - (opts.slackSeconds ?? defaultOpsDispatchTiming.createdAtSlackSeconds) * 1000;
  let best: WorkflowRun | null = null;
  let bestT = -Infinity;
  for (const r of list) {
    if (opts.previousRunId != null && r.id === opts.previousRunId) continue;
    const t = parseTime(r.createdAt);
    if (t === null || t < floor) continue;
    if (t > bestT) {
      best = r;
      bestT = t;
    }
  }
  return best;
}

export type DispatchPhase = 'queued' | 'running' | 'done' | 'failed' | 'timeout' | 'error';

export interface DispatchOutcome {
  phase: Exclude<DispatchPhase, 'queued' | 'running'>;
  workflow: string;
  run?: WorkflowRun;
  runsUrl?: string;
  error?: string;
}

export interface DispatchAndWaitOptions {
  client: ActionsClient;
  workflow: string;
  /** `ops.dispatch` (timing keys fall back to defaults). */
  dispatch?: Pick<OpsDispatch, 'pollSeconds' | 'timeoutMinutes' | 'createdAtSlackSeconds'>;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Called on every phase change (queued → running → …). */
  onUpdate?: (phase: DispatchPhase, run?: WorkflowRun) => void;
}

/**
 * Dispatch a workflow and poll until the run it started completes. Reads the
 * latest run first (its id is the guard against reporting the previous run),
 * records the click time, dispatches, then polls. A poll error ends with
 * `error`; running past the timeout ends with `timeout`, never `done`.
 */
export async function dispatchAndWait(opts: DispatchAndWaitOptions): Promise<DispatchOutcome> {
  const { client, workflow } = opts;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollMs = (opts.dispatch?.pollSeconds ?? defaultOpsDispatchTiming.pollSeconds) * 1000;
  const timeoutMs = (opts.dispatch?.timeoutMinutes ?? defaultOpsDispatchTiming.timeoutMinutes) * 60_000;
  const slackSeconds = opts.dispatch?.createdAtSlackSeconds ?? defaultOpsDispatchTiming.createdAtSlackSeconds;

  let previousRunId: number | null = null;
  try {
    previousRunId = (await client.latestRun(workflow))?.id ?? null;
  } catch (err) {
    // Off-allowlist must not be swallowed; a failed pre-read is tolerated
    // (the click-time floor still guards).
    if (err instanceof WorkflowNotAllowedError) return { phase: 'error', workflow, error: err.message };
  }
  const clickTime = now();
  let runsUrl: string;
  try {
    ({ runsUrl } = await client.dispatchWorkflow(workflow));
  } catch (err) {
    return { phase: 'error', workflow, error: err instanceof Error ? err.message : String(err) };
  }
  opts.onUpdate?.('queued');
  let lastPhase: DispatchPhase = 'queued';
  const deadline = clickTime + timeoutMs;
  while (now() < deadline) {
    await sleep(pollMs);
    let runs: WorkflowRun[];
    try {
      runs = await client.recentRuns(workflow);
    } catch (err) {
      return { phase: 'error', workflow, runsUrl, error: err instanceof Error ? err.message : String(err) };
    }
    const run = findRunAfter(runs, { clickTime, slackSeconds, previousRunId });
    if (!run) continue;
    if (run.status === 'completed') {
      const phase = run.conclusion === 'success' ? 'done' : 'failed';
      opts.onUpdate?.(phase, run);
      return { phase, workflow, run, runsUrl };
    }
    if (lastPhase !== 'running') {
      lastPhase = 'running';
      opts.onUpdate?.('running', run);
    }
  }
  return { phase: 'timeout', workflow, runsUrl, error: `still running after ${timeoutMs / 60_000} min; check Actions` };
}

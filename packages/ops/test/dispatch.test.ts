import { describe, expect, it, vi } from 'vitest';
import {
  ActionsApiError,
  WorkflowNotAllowedError,
  checkOpsConfig,
  createActionsClient,
  dispatchAndWait,
  escapeWorkflowCommand,
  findRunAfter,
  missingEnv,
  skipWithWarning,
  type WorkflowRun,
} from '../src/index.js';

const CLICK = Date.parse('2026-11-17T12:00:00Z');
const iso = (offsetSec: number) => new Date(CLICK + offsetSec * 1000).toISOString();
const run = (id: number, createdOffsetSec: number, status = 'completed', conclusion: string | null = 'success'): WorkflowRun => ({
  id,
  status,
  conclusion,
  htmlUrl: `https://example.test/runs/${id}`,
  createdAt: iso(createdOffsetSec),
  event: 'workflow_dispatch',
});
const ghRun = (r: WorkflowRun) => ({ id: r.id, status: r.status, conclusion: r.conclusion, html_url: r.htmlUrl, created_at: r.createdAt, event: r.event });

describe('findRunAfter', () => {
  it('ignores a run created before the click (the previous cron), even if it just completed', () => {
    expect(findRunAfter(run(1, -3600), { clickTime: CLICK })).toBeNull();
  });
  it('accepts a run created after the click', () => {
    expect(findRunAfter([run(2, 5)], { clickTime: CLICK })?.id).toBe(2);
  });
  it('slack tolerates clock skew but no more', () => {
    expect(findRunAfter([run(3, -60)], { clickTime: CLICK, slackSeconds: 90 })?.id).toBe(3);
    expect(findRunAfter([run(3, -91)], { clickTime: CLICK, slackSeconds: 90 })).toBeNull();
    expect(findRunAfter([run(3, -60)], { clickTime: CLICK, slackSeconds: 0 })).toBeNull();
  });
  it('the pre-read run id is excluded even inside the slack window', () => {
    expect(findRunAfter([run(4, -10)], { clickTime: CLICK, previousRunId: 4 })).toBeNull();
  });
  it('picks the newest qualifying run; unparseable createdAt never qualifies', () => {
    const bad = { ...run(9, 0), createdAt: 'nope' };
    expect(findRunAfter([run(5, -500), run(6, 3), run(7, 10), bad], { clickTime: CLICK })?.id).toBe(7);
  });
});

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init ?? {})) as unknown as typeof fetch;
}

describe('createActionsClient', () => {
  const base = { owner: 'acme', repo: 'site', ref: 'main', token: 't0k', allowlist: ['fetch-data.yml'] };

  it('refuses off-allowlist workflows without calling the network', async () => {
    const f = fakeFetch(() => new Response(null, { status: 204 }));
    const c = createActionsClient({ ...base, fetch: f });
    await expect(c.dispatchWorkflow('deploy.yml')).rejects.toBeInstanceOf(WorkflowNotAllowedError);
    await expect(c.latestRun('../../secrets')).rejects.toBeInstanceOf(WorkflowNotAllowedError);
    expect(f).not.toHaveBeenCalled();
  });

  it('dispatches on the configured ref with auth headers', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const f = fakeFetch((url, init) => {
      seen = { url, init };
      return new Response(null, { status: 204 });
    });
    const out = await createActionsClient({ ...base, fetch: f }).dispatchWorkflow('fetch-data.yml');
    expect(seen!.url).toBe('https://api.github.com/repos/acme/site/actions/workflows/fetch-data.yml/dispatches');
    expect(seen!.init.method).toBe('POST');
    expect(JSON.parse(String(seen!.init.body))).toEqual({ ref: 'main' });
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe('Bearer t0k');
    expect(out.runsUrl).toBe('https://github.com/acme/site/actions/workflows/fetch-data.yml');
  });

  it.each([403, 404])('a %i names the "Actions: Read and write" fix', async (status) => {
    const f = fakeFetch(() => new Response('Resource not accessible by personal access token', { status }));
    const err = await createActionsClient({ ...base, fetch: f }).dispatchWorkflow('fetch-data.yml').catch((e) => e);
    expect(err).toBeInstanceOf(ActionsApiError);
    expect(err.permission).toBe(true);
    expect(err.message).toMatch(/GitHub Actions API \d+\. The GITHUB_TOKEN fine-grained token needs the "Actions: Read and write" repository permission/);
  });

  it('a 500 is not blamed on the token', async () => {
    const f = fakeFetch(() => new Response('oops', { status: 500 }));
    const err = await createActionsClient({ ...base, fetch: f }).latestRun('fetch-data.yml').catch((e) => e);
    expect(err.permission).toBe(false);
    expect(err.message).not.toMatch(/Actions: Read and write/);
  });

  it('reads runs for the ref', async () => {
    const f = fakeFetch((url) => {
      expect(url).toContain('/actions/workflows/fetch-data.yml/runs?per_page=1&branch=main');
      return Response.json({ workflow_runs: [ghRun(run(11, 0))] });
    });
    expect((await createActionsClient({ ...base, fetch: f }).latestRun('fetch-data.yml'))?.id).toBe(11);
  });
});

describe('dispatchAndWait', () => {
  function scripted(polls: WorkflowRun[][], prev: WorkflowRun | null) {
    let clock = CLICK;
    let poll = 0;
    const client = {
      runsUrl: () => 'u',
      latestRun: vi.fn(async () => prev),
      dispatchWorkflow: vi.fn(async (workflow: string) => ({ workflow, dispatchedAt: new Date(clock).toISOString(), runsUrl: 'u' })),
      recentRuns: vi.fn(async () => polls[Math.min(poll++, polls.length - 1)]!),
    };
    return {
      client,
      now: () => clock,
      sleep: async (ms: number) => {
        clock += ms;
      },
    };
  }

  it('does not report the previous (just-finished) run as done', async () => {
    const prev = run(100, -30); // finished seconds before the click, inside slack
    const ours = run(101, 4, 'in_progress', null);
    const s = scripted([[prev], [ours, prev], [{ ...ours, status: 'completed', conclusion: 'success' }, prev]], prev);
    const phases: string[] = [];
    const out = await dispatchAndWait({ client: s.client, workflow: 'w.yml', now: s.now, sleep: s.sleep, onUpdate: (p) => phases.push(p) });
    expect(out.phase).toBe('done');
    expect(out.run?.id).toBe(101);
    expect(phases).toEqual(['queued', 'running', 'done']);
    expect(s.client.recentRuns).toHaveBeenCalledTimes(3);
  });

  it('a failed conclusion is failed', async () => {
    const s = scripted([[run(5, 2, 'completed', 'failure')]], null);
    expect((await dispatchAndWait({ client: s.client, workflow: 'w.yml', now: s.now, sleep: s.sleep })).phase).toBe('failed');
  });

  it('times out rather than claiming done', async () => {
    const s = scripted([[run(1, -3600)]], run(1, -3600));
    const out = await dispatchAndWait({ client: s.client, workflow: 'w.yml', now: s.now, sleep: s.sleep, dispatch: { pollSeconds: 60, timeoutMinutes: 5 } });
    expect(out.phase).toBe('timeout');
    expect(s.client.recentRuns).toHaveBeenCalledTimes(5);
  });

  it('a failed pre-read still guards by click time', async () => {
    const s = scripted([[run(1, -3600)], [run(2, 3)]], null);
    s.client.latestRun.mockRejectedValueOnce(new Error('network'));
    const out = await dispatchAndWait({ client: s.client, workflow: 'w.yml', now: s.now, sleep: s.sleep });
    expect(out.run?.id).toBe(2);
  });

  it('a dispatch error is an error outcome', async () => {
    const s = scripted([[]], null);
    s.client.dispatchWorkflow.mockRejectedValueOnce(new Error('GitHub Actions API 403.'));
    expect(await dispatchAndWait({ client: s.client, workflow: 'w.yml', now: s.now, sleep: s.sleep })).toMatchObject({ phase: 'error', error: 'GitHub Actions API 403.' });
  });
});

describe('skipWithWarning', () => {
  it('prints a ::warning:: line naming what is missing and returns true', () => {
    const lines: string[] = [];
    expect(skipWithWarning('fetch-data', ['API_KEY', 'SITE_ID'], { consequence: 'data.json is NOT being refreshed', log: (l) => lines.push(l) })).toBe(true);
    expect(lines).toEqual(['::warning::fetch-data skipped — missing API_KEY, SITE_ID; data.json is NOT being refreshed.']);
  });
  it('returns false and prints nothing when nothing is missing', () => {
    const log = vi.fn();
    expect(skipWithWarning('x', [], { log })).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });
  it('missingEnv treats blank as missing; messages are escaped', () => {
    expect(missingEnv(['A', 'B', 'C'], { A: 'x', B: '  ' })).toEqual(['B', 'C']);
    expect(escapeWorkflowCommand('50%\nnext')).toBe('50%25%0Anext');
  });
});

describe('checkOpsConfig', () => {
  const ops = {
    pipelines: [{ id: 'a', name: 'A', file: 'a.json', source: 's', cadenceDays: 1, timestampField: 't', run: { kind: 'workflow' as const, workflow: 'fetch.yml' } }],
    grading: { lateMultiplier: 1.5, staleMultiplier: 3 },
    cadence: { articleDays: 14 },
    dispatch: { allowlist: ['fetch.yml', 'gone.yml'] },
  };
  it('flags allowlisted workflows that do not exist and names the token permission', () => {
    const out = checkOpsConfig(ops, { workflowExists: (f) => f === 'fetch.yml' });
    expect(out.filter((c) => c.status === 'error').map((c) => c.message)).toEqual([
      'ops.dispatch.allowlist names gone.yml, but .github/workflows/gone.yml does not exist',
    ]);
    expect(out.some((c) => c.status === 'warn' && /Actions: Read and write/.test(c.message))).toBe(true);
  });
  it('missing ops section is a warning', () => {
    expect(checkOpsConfig(undefined)[0]!.status).toBe('warn');
  });
});

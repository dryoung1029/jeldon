import type { OpsConfig } from '@jeldon/config';

export interface OpsCheck {
  status: 'ok' | 'warn' | 'error';
  message: string;
}

/**
 * Static checks for `ops`, used by `jeldon doctor`. No network: the token's
 * Actions permission cannot be proven offline, so when dispatch is configured
 * the check says what the token needs instead of claiming it has it.
 */
export function checkOpsConfig(
  ops: OpsConfig | undefined,
  opts: { workflowExists?: (file: string) => boolean } = {},
): OpsCheck[] {
  const out: OpsCheck[] = [];
  if (!ops) {
    out.push({ status: 'warn', message: 'capabilities.ops is on but no ops section is set; nothing is graded' });
    return out;
  }
  if (ops.pipelines.length) out.push({ status: 'ok', message: `ops: ${ops.pipelines.length} pipeline(s) graded for freshness` });
  else out.push({ status: 'warn', message: 'ops.pipelines is empty; no cron-fed file is graded for freshness' });

  const allow = ops.dispatch?.allowlist ?? [];
  for (const p of ops.pipelines) {
    if (p.run?.kind === 'workflow' && !allow.includes(p.run.workflow)) {
      out.push({ status: 'error', message: `ops pipeline "${p.id}" runs ${p.run.workflow}, which is not in ops.dispatch.allowlist` });
    }
  }
  if (ops.dispatch) {
    if (opts.workflowExists) {
      for (const wf of allow) {
        if (!opts.workflowExists(wf)) out.push({ status: 'error', message: `ops.dispatch.allowlist names ${wf}, but .github/workflows/${wf} does not exist` });
      }
    }
    out.push({
      status: 'warn',
      message:
        'ops.dispatch is set: the GitHub token must have the "Actions: Read and write" repository permission (fine-grained PAT), or every dispatch fails with 403/404. Doctor cannot verify this offline.',
    });
  }
  return out;
}

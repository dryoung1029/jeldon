import { loadDomainPack } from '@jeldon/config';

export type CheckStatus = 'ok' | 'warn' | 'error';
export interface DoctorCheck {
  status: CheckStatus;
  message: string;
}
export interface DoctorReport {
  checks: DoctorCheck[];
  ok: boolean;
  errors: number;
  warnings: number;
}

/**
 * The deterministic "am I wired correctly?" gate. Run before AND after agent
 * work; the same checks back the `doctor.yml` CI gate so local-green and
 * CI-green agree. `pre: true` skips checks that require a fully-filled config.
 */
export async function runDoctor(opts: { cwd?: string; pre?: boolean } = {}): Promise<DoctorReport> {
  const cwd = opts.cwd ?? process.cwd();
  const checks: DoctorCheck[] = [];
  const add = (status: CheckStatus, message: string) => checks.push({ status, message });

  let pack;
  try {
    pack = await loadDomainPack({ cwd });
    add('ok', 'jeldon.config.ts present and valid against schema');
  } catch (err) {
    add('error', err instanceof Error ? err.message : String(err));
    return finalize(checks);
  }

  // Required env vars.
  for (const v of pack.services.requiredEnv) {
    if (process.env[v]) add('ok', `env ${v} present`);
    else add(opts.pre ? 'warn' : 'error', `env ${v} missing`);
  }

  // GEO floor vs category targets (schema enforces, but doctor surfaces it).
  const targets = Object.values(pack.content.categoryTargets);
  if (targets.length) {
    const minTarget = Math.min(...targets);
    if (pack.scoring.geo.floor <= minTarget) add('ok', `GEO floor ${pack.scoring.geo.floor} <= lowest category target ${minTarget}`);
    else add('error', `GEO floor ${pack.scoring.geo.floor} exceeds lowest category target ${minTarget}`);
  }

  // Category enum consistency.
  const orphanTargets = Object.keys(pack.content.categoryTargets).filter((c) => !pack.content.categories.includes(c));
  if (orphanTargets.length) add('error', `categoryTargets has categories not in content.categories: ${orphanTargets.join(', ')}`);
  else add('ok', 'category enum consistent across config');

  // AEO query set.
  if (pack.aeo.querySet.length >= 3) add('ok', `AEO query set has ${pack.aeo.querySet.length} queries`);
  else if (pack.aeo.querySet.length > 0) add('warn', `AEO query set has only ${pack.aeo.querySet.length} (recommend >= 3)`);
  else add('error', 'AEO query set is empty — add >= 3 queries');

  // Voice anchors (drafting fidelity).
  if (pack.voice.voiceAnchorUrls.length) add('ok', `${pack.voice.voiceAnchorUrls.length} voice anchor URL(s) set`);
  else add('warn', 'no voiceAnchorUrls set — drafting voice fidelity degraded');

  // Capability ↔ env sanity.
  if (pack.capabilities.drafting && !pack.services.requiredEnv.some((v) => /ANTHROPIC|OPENAI|API_KEY/.test(v))) {
    add('warn', 'capabilities.drafting is on but no LLM API key is listed in services.requiredEnv');
  }

  return finalize(checks);
}

function finalize(checks: DoctorCheck[]): DoctorReport {
  const errors = checks.filter((c) => c.status === 'error').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  return { checks, errors, warnings, ok: errors === 0 };
}

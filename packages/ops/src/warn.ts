/**
 * Crons that skip on missing secrets must not skip silently. A plain log line
 * inside a green run is how a pipeline stays dead for months; a GitHub
 * `::warning::` annotation shows on the run summary. Pair it with a freshness
 * check (`pipelineStatus`), which catches the skip even when nobody opens the
 * run.
 */

/** Escape a workflow-command message (GitHub requires %, CR and LF encoded). */
export function escapeWorkflowCommand(message: string): string {
  return message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** Names in `names` that are unset or blank in `env`. */
export function missingEnv(
  names: readonly string[],
  env: Record<string, string | undefined> = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {},
): string[] {
  return names.filter((n) => !env[n] || !String(env[n]).trim());
}

export interface SkipWarningOptions {
  /** What is NOT happening because of the skip, e.g. "data.json is NOT being refreshed". */
  consequence?: string;
  /** Output sink. Default `console.log` (workflow commands go to stdout). */
  log?: (line: string) => void;
}

/**
 * If anything is missing, print a `::warning::` line naming the job and the
 * missing names and return true (the caller then returns / exits 0).
 * Returns false when nothing is missing.
 *
 *     if (skipWithWarning('fetch-data', missingEnv(['API_KEY']))) process.exit(0);
 */
export function skipWithWarning(name: string, missing: readonly string[], opts: SkipWarningOptions = {}): boolean {
  if (!missing.length) return false;
  const consequence = opts.consequence ? `; ${opts.consequence}` : '';
  const line = `::warning::${escapeWorkflowCommand(`${name} skipped — missing ${missing.join(', ')}${consequence}.`)}`;
  (opts.log ?? console.log)(line);
  return true;
}

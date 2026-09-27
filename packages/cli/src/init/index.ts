// Placeholder until the spawn engine lands (Workstream 5). Kept so `jeldon
// init` resolves; replaced by the real implementation in the same landmark.
export async function runInit(_args: string[]): Promise<number> {
  console.error('jeldon init: the spawn engine is not wired yet.');
  return 1;
}

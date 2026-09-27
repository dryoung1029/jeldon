/**
 * The compliance pack name, as a plain constant the contact Worker can bundle.
 * `jeldon init` writes this from jeldon.config.ts (`compliance.pack`); the
 * build-time pages read the pack directly. Keep the two in sync (doctor's
 * kit:routes-match-pack sibling check covers routes; this one is small enough
 * to eyeball). Default: 'none'.
 */
export const COMPLIANCE_PACK: string = 'none';

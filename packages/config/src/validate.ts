import { domainPackSchema } from './schema.js';
import type { DomainPack } from './types.js';

export interface ValidateResult {
  ok: boolean;
  data?: DomainPack;
  errors: Array<{ path: string; message: string }>;
}

/** Validate a plain object against the Domain Pack schema. Pure — no I/O, no
 *  `node:*` imports — so it is safe to call from a Cloudflare Worker route or
 *  the browser. */
export function validateDomainPack(input: unknown): ValidateResult {
  const parsed = domainPackSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, data: parsed.data as DomainPack, errors: [] };
  }
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => ({
      path: i.path.join('.') || '(root)',
      message: i.message,
    })),
  };
}

/** Identity helper for type-safe config authoring in `jeldon.config.ts`. */
export function defineDomainPack(pack: DomainPack): DomainPack {
  return pack;
}

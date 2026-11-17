/**
 * @jeldon/access — admin route protection.
 *
 * Ported from Body of Health `src/middleware.ts` (fail-closed 2026-10-27,
 * canonical path + route pattern 2026-11-09). Every value that was a literal
 * there (prefixes, team domain, AUD) comes from `pack.security`. Edge-safe:
 * WebCrypto, `fetch`, `atob` only.
 */

export { canonicalPath, isProtected } from './path.js';
export {
  verifyAccessJwt,
  extractAccessJwt,
  normalizeTeamDomain,
  defaultFetchJwks,
  JwksCache,
  type Jwk,
  type AccessClaims,
  type VerifyResult,
  type VerifyOptions,
  type FetchJwks,
} from './jwt.js';
export {
  decideAccess,
  createAccessMiddleware,
  denyResponse,
  resolveAccessConfig,
  type AccessContext,
  type AccessNext,
  type AccessDecision,
  type AccessGateOptions,
} from './middleware.js';

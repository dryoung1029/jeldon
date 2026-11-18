/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

/** `pack.security ?? defaultSecurityConfig`, injected by astro.config.mjs so
 *  the worker never loads jeldon.config.ts from disk. */
declare const __JELDON_SECURITY__: import('@jeldon/config').SecurityConfig;

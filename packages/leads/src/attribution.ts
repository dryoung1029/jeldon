import { defaultLeadsConfig, type LeadAttributionConfig } from '@jeldon/config';

/**
 * First-touch attribution: the page a visitor landed on, where they came from,
 * and any UTM tags, captured once per browser session and sent only with the
 * form the visitor chooses to submit.
 *
 * The server never trusts the browser's values. It keeps:
 *   - a PATH-only landing page (no query, no hash: a query can carry an email
 *     address or a search term the visitor never meant to send us),
 *   - a HOSTNAME-only referrer,
 *   - whitelisted UTM keys, stripped to `[\w.-]` and length-capped,
 *   - a clamped phone-tap count, plus its timestamp only when the count is > 0.
 */

export interface RawAttribution {
  landingPage?: unknown;
  referrer?: unknown;
  /** Either a `utm` record or flat `utm_source`-style keys. */
  utm?: unknown;
  phoneClicks?: unknown;
  calledAt?: unknown;
  [key: string]: unknown;
}

export interface Attribution {
  landingPage?: string;
  referrer?: string;
  utm: Record<string, string>;
  /** Phone-number taps before the form was sent. Absent = not captured
   *  (pre-capture lead), which is NOT the same as 0. */
  phoneClicks?: number;
  calledAt?: string;
}

const PATH_RE = /^\/[^\s<>"'\\]*$/;

/** Path only: drops scheme/host, query and hash; must start with `/`. */
export function sanitizePath(raw: unknown, maxChars = defaultLeadsConfig.attribution.maxLandingChars): string {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    try {
      s = new URL(s).pathname;
    } catch {
      return '';
    }
  }
  s = s.replace(/[?#].*$/, '').slice(0, maxChars);
  return PATH_RE.test(s) && !s.startsWith('//') ? s : '';
}

/** Hostname only, lowercased; '' when unparseable. */
export function sanitizeReferrer(raw: unknown, maxChars = defaultLeadsConfig.attribution.maxReferrerChars): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase().slice(0, maxChars);
  } catch {
    return '';
  }
}

export function sanitizeUtmValue(raw: unknown, maxChars = defaultLeadsConfig.attribution.maxUtmChars): string {
  return String(raw ?? '').trim().replace(/[^\w.-]/g, '').slice(0, maxChars);
}

export function sanitizeAttribution(
  raw: RawAttribution | null | undefined,
  cfg: LeadAttributionConfig = defaultLeadsConfig.attribution,
): Attribution {
  const r = raw ?? {};
  const out: Attribution = { utm: {} };
  const landing = sanitizePath(r.landingPage, cfg.maxLandingChars);
  if (landing) out.landingPage = landing;
  const ref = sanitizeReferrer(r.referrer, cfg.maxReferrerChars);
  if (ref) out.referrer = ref;

  const utmSrc = (r.utm && typeof r.utm === 'object' ? r.utm : r) as Record<string, unknown>;
  for (const key of cfg.utmKeys) {
    const v = sanitizeUtmValue(utmSrc[key], cfg.maxUtmChars);
    if (v) out.utm[key] = v;
  }

  if (r.phoneClicks !== undefined && r.phoneClicks !== null && r.phoneClicks !== '') {
    const n = parseInt(String(r.phoneClicks), 10);
    out.phoneClicks = Number.isFinite(n) ? Math.min(Math.max(n, 0), 99) : 0;
    const at = String(r.calledAt ?? '').trim().slice(0, 40);
    if (out.phoneClicks > 0 && at && !Number.isNaN(Date.parse(at))) out.calledAt = at;
  }
  return out;
}

/** Keep `v` only if it is one of the allowed request controls. */
export function sanitizeRequestVia(v: unknown, allowed: string[] = defaultLeadsConfig.requestVia): string {
  const s = String(v ?? '');
  return allowed.includes(s) ? s : '';
}

/**
 * The browser half, as an inline-script string for a layout
 * (`<script is:inline set:html={attributionSnippet(cfg)} />` in Astro).
 *
 * - Captures landing path+query, referrer and UTM keys once per session.
 * - Counts `tel:` taps on EVERY page (its own IIFE: the capture block returns
 *   early after the first page, and the tap listener must still arm).
 * - Defines `window.jeldonFirstTouch()` returning the fields to merge into the
 *   form payload. Nothing is sent anywhere until the form is submitted.
 */
export function attributionSnippet(cfg: LeadAttributionConfig = defaultLeadsConfig.attribution): string {
  const p = JSON.stringify(cfg.storagePrefix);
  const keys = JSON.stringify(cfg.utmKeys);
  const capture = `(function(){try{var P=${p};if(sessionStorage.getItem(P+'landing'))return;var q=new URLSearchParams(location.search);sessionStorage.setItem(P+'landing',location.pathname);sessionStorage.setItem(P+'referrer',document.referrer||'');var u={};${keys}.forEach(function(k){if(q.get(k))u[k]=q.get(k)});sessionStorage.setItem(P+'utm',JSON.stringify(u))}catch(e){}})();`;
  const taps =
    cfg.capturePhoneTaps === false
      ? ''
      : `(function(){var P=${p};document.addEventListener('click',function(ev){var el=ev.target&&ev.target.closest?ev.target.closest('a[href^="tel:"]'):null;if(!el)return;try{var n=parseInt(sessionStorage.getItem(P+'calls')||'0',10)||0;sessionStorage.setItem(P+'calls',String(n+1));if(!sessionStorage.getItem(P+'callAt'))sessionStorage.setItem(P+'callAt',new Date().toISOString())}catch(e){}},true)})();`;
  const reader = `window.jeldonFirstTouch=function(){var P=${p},o={};try{o.landingPage=sessionStorage.getItem(P+'landing')||'';o.referrer=sessionStorage.getItem(P+'referrer')||'';o.utm=JSON.parse(sessionStorage.getItem(P+'utm')||'{}');${cfg.capturePhoneTaps === false ? '' : "o.phoneClicks=sessionStorage.getItem(P+'calls')||'0';o.calledAt=sessionStorage.getItem(P+'callAt')||'';"}}catch(e){}return o};`;
  return capture + taps + reader;
}

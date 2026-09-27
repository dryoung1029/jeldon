/**
 * @jeldon/kit-local-business/node — Node-only pieces: load `kit.config.ts`
 * (jiti), the kit's registered doctor checks, and the workbench functions
 * (test the live contact form, build the Search Console report).
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
import type { DomainPack } from '@jeldon/config';
import { parseSearchConsoleExport, renderSearchConsoleReport } from '@jeldon/crawler-analytics';
import { countSetupMarkers, validateKitConfig, type KitConfig } from './kit-config.js';

export const KIT_CONFIG_CANDIDATES = ['kit.config.ts', 'kit.config.mjs', 'kit.config.js'];

export function resolveKitConfigPath(cwd = process.cwd()): string | null {
  for (const n of KIT_CONFIG_CANDIDATES) {
    const p = resolve(cwd, n);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Load + validate `kit.config.ts` (default export or `kit` named export). */
export async function loadKitConfig(cwd = process.cwd()): Promise<KitConfig> {
  const path = resolveKitConfigPath(cwd);
  if (!path) throw new Error(`No kit config found. Expected one of ${KIT_CONFIG_CANDIDATES.join(', ')} in ${cwd}.`);
  const jiti = createJiti(pathToFileURL(cwd + '/').href);
  const mod = (await jiti.import(path)) as { default?: unknown; kit?: unknown };
  const raw = mod.default ?? mod.kit ?? mod;
  const r = validateKitConfig(raw);
  if (!r.ok || !r.data) {
    throw new Error(`Invalid kit config at ${path}:\n${r.errors.map((e) => `  • ${e.path}: ${e.message}`).join('\n')}`);
  }
  return r.data;
}

// ---------------------------------------------------------------------------
// Registered doctor checks (Helix finding #10 → check-site.mjs, as a registry)
// ---------------------------------------------------------------------------

export type CheckStatus = 'ok' | 'warn' | 'error';
export interface KitCheckResult { status: CheckStatus; message: string }
export interface KitCheckContext { cwd: string; pack: DomainPack; pre: boolean }
export interface KitCheck { id: string; run(ctx: KitCheckContext): Promise<KitCheckResult | KitCheckResult[]> | KitCheckResult | KitCheckResult[] }

async function walk(dir: string, exts: RegExp): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, exts)));
    else if (exts.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * The kit's checks. `jeldon.checks.mjs` in a consumer:
 *   import { kitChecks } from '@jeldon/kit-local-business/node';
 *   export default kitChecks();
 * Warnings never fail the doctor; errors do. Secrets are checked as env HERE,
 * but the real test is `test-contact` against the live URL (they live in the
 * Cloudflare dashboard) — the message says so.
 */
export function kitChecks(): KitCheck[] {
  return [
    {
      id: 'kit:config',
      async run({ cwd }) {
        try {
          const kit = await loadKitConfig(cwd);
          return { status: 'ok', message: `kit.config.ts valid (${kit.vertical} vocabulary)` };
        } catch (err) {
          return { status: 'error', message: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      id: 'kit:routes-match-pack',
      async run({ cwd, pack }) {
        const kit = await loadKitConfig(cwd);
        const prefix = pack.content.articlePathPrefix ?? '/articles/';
        return kit.routes.blog === prefix
          ? { status: 'ok', message: `routes.blog matches content.articlePathPrefix (${prefix})` }
          : { status: 'error', message: `routes.blog (${kit.routes.blog}) must equal content.articlePathPrefix (${prefix})` };
      },
    },
    {
      id: 'kit:setup-markers',
      async run({ cwd, pre }) {
        const configs = ['kit.config.ts', 'jeldon.config.ts'].map((f) => resolve(cwd, f)).filter(existsSync);
        let inConfig = 0;
        for (const f of configs) inConfig += countSetupMarkers(await readFile(f, 'utf8'));
        let inContent = 0;
        for (const dir of ['src/content', 'src/pages']) {
          for (const f of await walk(resolve(cwd, dir), /\.(md|mdx|astro|json)$/)) inContent += countSetupMarkers(await readFile(f, 'utf8'));
        }
        const out: KitCheckResult[] = [];
        out.push(inConfig === 0 ? { status: 'ok', message: 'no SETUP markers left in kit.config.ts / jeldon.config.ts' } : { status: pre ? 'warn' : 'warn', message: `${inConfig} SETUP marker(s) still in kit.config.ts / jeldon.config.ts (run /setup to fill them)` });
        out.push(inContent === 0 ? { status: 'ok', message: 'no SETUP markers left in content or pages' } : { status: 'warn', message: `${inContent} SETUP marker(s) still in content or pages` });
        return out;
      },
    },
    {
      id: 'kit:owner-confirmed',
      async run({ cwd }) {
        const kit = await loadKitConfig(cwd);
        const out: KitCheckResult[] = [];
        out.push(kit.site.hoursConfirmed ? { status: 'ok', message: 'hours confirmed' } : { status: 'warn', message: 'hours not confirmed (footer shows a generic line until they are)' });
        const plans = Object.values(kit.booking.plans ?? {});
        const blankPlans = plans.filter((p) => !p).length;
        if (plans.length) out.push(blankPlans === 0 ? { status: 'ok', message: `${plans.length} booking plan link(s) set` } : { status: 'warn', message: `${blankPlans} booking plan link(s) blank — those buttons fall back to the contact form` });
        out.push(kit.analytics?.cloudflareToken ? { status: 'ok', message: 'Cloudflare Web Analytics token set' } : { status: 'warn', message: 'no Cloudflare Web Analytics token — no traffic data will be collected' });
        return out;
      },
    },
    {
      id: 'kit:contact-destinations',
      async run({ cwd, pre }) {
        const kit = await loadKitConfig(cwd);
        const env = process.env;
        const out: KitCheckResult[] = [];
        const where = 'set in Cloudflare → Workers & Pages → your project → Settings → Variables and Secrets';
        if (kit.contact.leadSink === 'pushpress' && !(env.PUSHPRESS_API_KEY && env.PUSHPRESS_COMPANY_ID)) out.push({ status: 'warn', message: `PUSHPRESS_API_KEY / PUSHPRESS_COMPANY_ID not set in this environment (${where}); contact form will skip PushPress` });
        if (kit.contact.leadSink === 'gohighlevel' && !(kit.contact.goHighLevelWebhookUrl || env.GHL_WEBHOOK_URL)) out.push({ status: 'warn', message: 'GoHighLevel webhook URL not set (kit.config contact.goHighLevelWebhookUrl or GHL_WEBHOOK_URL)' });
        if (kit.contact.notifier === 'brevo' && !env.BREVO_API_KEY) out.push({ status: 'warn', message: `BREVO_API_KEY not set in this environment (${where}); contact form will skip email` });
        if (kit.contact.notifier === 'resend' && !env.RESEND_API_KEY) out.push({ status: 'warn', message: `RESEND_API_KEY not set in this environment (${where}); contact form will skip email` });
        if (kit.contact.notifier !== 'none' && !(env.LEAD_NOTIFY_TO && env.LEAD_NOTIFY_FROM)) out.push({ status: 'warn', message: 'LEAD_NOTIFY_TO / LEAD_NOTIFY_FROM not set — the notifier never guesses a recipient' });
        // Before setup (--pre) this is expected; at launch it is a hard error.
        if (kit.contact.leadSink === 'none' && kit.contact.notifier === 'none') out.push({ status: pre ? 'warn' : 'error', message: 'contact form has no destination at all (leadSink and notifier are both "none") — visitors would hit the 503 "call us" path every time' });
        if (!out.length) out.push({ status: 'ok', message: 'contact-form destinations configured in this environment' });
        else out.push({ status: 'warn', message: 'secrets live in Cloudflare, so the real check is the test-contact script against the live URL — /launch requires it to pass' });
        return out;
      },
    },
    {
      id: 'kit:published-articles',
      async run({ cwd, pack }) {
        const dir = resolve(cwd, pack.services.contentDir ?? 'src/content/articles');
        const files = (await walk(dir, /\.md$/));
        let live = 0;
        for (const f of files) if (!/^draft:\s*true/m.test(await readFile(f, 'utf8'))) live++;
        return live > 0 ? { status: 'ok', message: `${live} published article(s)` } : { status: 'warn', message: 'no published articles yet (seed articles stay drafts until the owner approves them)' };
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Workbench
// ---------------------------------------------------------------------------

/** POST a test submission to the live contact endpoint. Expect `{ ok: true }`. */
export async function sendTestContact(baseUrl: string, opts: { contactRoute?: string; fetchImpl?: typeof fetch } = {}): Promise<{ status: number; body: string }> {
  const base = baseUrl.replace(/\/$/, '');
  const body = new URLSearchParams({
    name: 'Website Test',
    email: `website-test+${Date.now()}@example.com`,
    phone: '555-0100',
    subject: 'Something else',
    message: `Test message from jeldon test-contact at ${new Date().toISOString()}. Safe to delete.`,
    page: opts.contactRoute ?? '/contact/',
  });
  const res = await (opts.fetchImpl ?? fetch)(`${base}/api/contact/`, {
    method: 'POST',
    headers: { Accept: 'application/json', Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return { status: res.status, body: await res.text() };
}

/** Read every Search Console CSV under `dir` and write `report.md` there. */
export async function buildTrafficReport(dir = 'data/search-console'): Promise<{ report: string; files: string[] }> {
  const files = (await walk(dir, /\.csv$/i)).sort();
  const exports = [];
  for (const f of files) exports.push({ file: f, data: parseSearchConsoleExport(await readFile(f, 'utf8'), f) });
  const report = files.length
    ? renderSearchConsoleReport(exports)
    : `No CSVs found in ${dir}/. Export from Search Console (Performance → Export → Download CSV) and drop the files there.\n`;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'report.md'), report);
  return { report, files };
}

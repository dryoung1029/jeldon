/**
 * `jeldon init [dir] --kit local-business --name … --url … --from … --answers … --crm … --notify …`
 *
 * The spawn. In order (each step idempotent; re-running fills gaps):
 *   1. scrape the old site (competitive-intel) + store its benchmark baseline
 *   2. interview (or read --answers): confirm what was scraped, ask what wasn't
 *   3. generate: pack, kit config, content stubs, redirects, agent kit, CI, README
 *   4. verify: npm install, validate, doctor --pre, build, INCLUDE_DRAFTS build
 *   5. print the SETUP marker count and the next step
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { captureBaseline, renderScorecardMarkdown, buildScorecard } from '@jeldon/benchmark';
import { initAnswersSchema, type InitAnswers, type InitAnswersInput } from './answers.js';
import { generate } from './generate.js';
import { guessVertical, scrapeOldSite, type Scrape } from './scrape.js';

interface Flags {
  dir: string;
  kit: string;
  name?: string;
  url?: string;
  from?: string;
  answers?: string;
  crm?: string;
  notify?: string;
  yes: boolean;
  force: boolean;
  noInstall: boolean;
  noScrape: boolean;
  noBaseline: boolean;
  psi: boolean;
  vendorFrom?: string;
  engineRange?: string;
  json: boolean;
}

function parseFlags(args: string[]): Flags {
  const f: Flags = { dir: '.', kit: 'local-business', yes: false, force: false, noInstall: false, noScrape: false, noBaseline: false, psi: false, json: false };
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const next = () => args[++i];
    switch (a) {
      case '--kit': f.kit = next() ?? f.kit; break;
      case '--name': f.name = next(); break;
      case '--url': f.url = next(); break;
      case '--from': f.from = next(); break;
      case '--answers': f.answers = next(); break;
      case '--crm': f.crm = next(); break;
      case '--notify': f.notify = next(); break;
      case '--vendor-from': f.vendorFrom = next(); break;
      case '--engine-range': f.engineRange = next(); break;
      case '--yes': case '-y': f.yes = true; break;
      case '--force': f.force = true; break;
      case '--no-install': f.noInstall = true; break;
      case '--no-scrape': f.noScrape = true; break;
      case '--no-baseline': f.noBaseline = true; break;
      case '--psi': f.psi = true; break;
      case '--json': f.json = true; break;
      default: if (!a.startsWith('--')) positional.push(a);
    }
  }
  if (positional[0]) f.dir = positional[0];
  return f;
}

const log = (line: string) => console.log(line);

/** Fold scraped facts under answers: answers win; scrape fills blanks (marked SETUP in the generated files). */
function mergeScrape(input: InitAnswersInput, s: Scrape | null): InitAnswersInput {
  if (!s) return input;
  const b = input.business;
  const address = { ...(b.address ?? {}) };
  address.street ??= s.nap.street;
  address.city ??= s.nap.city;
  address.region ??= s.nap.region;
  address.postalCode ??= s.nap.postalCode;
  address.geo ??= s.geo;
  const pushpress = s.bookingLinks.find((l) => l.vendor === 'pushpress');
  const sub = pushpress ? new URL(pushpress.url).hostname.split('.')[0] : undefined;
  return {
    ...input,
    vertical: input.vertical ?? guessVertical(s),
    business: {
      ...b,
      tagline: b.tagline ?? (s.title ?? undefined),
      shortPitch: b.shortPitch ?? (s.description ?? undefined),
      phone: b.phone ?? s.nap.phone,
      email: b.email ?? s.nap.email,
      address,
      social: b.social ?? (Object.keys(s.social).length ? s.social : undefined),
    },
    booking: {
      ...(input.booking ?? {}),
      kind: input.booking?.kind ?? (pushpress ? 'pushpress' : s.bookingLinks.length ? 'link' : 'none'),
      calendarUrl: input.booking?.calendarUrl ?? s.bookingLinks.find((l) => /calendar|schedule|book/i.test(l.url))?.url,
      pushpressSubdomain: input.booking?.pushpressSubdomain ?? sub,
    },
    analytics: { ...(input.analytics ?? {}), googleSiteVerification: input.analytics?.googleSiteVerification ?? (s.googleSiteVerification ?? undefined) },
    contact: { ...(input.contact ?? {}), crm: input.contact?.crm ?? (pushpress ? 'pushpress' : 'none') },
  };
}

async function interview(input: InitAnswersInput, scrape: Scrape | null, yes: boolean): Promise<InitAnswersInput> {
  if (yes || !stdin.isTTY) return input;
  const rl = createInterface({ input: stdin, output: stdout });
  const ask = async (label: string, current?: string): Promise<string | undefined> => {
    const a = (await rl.question(current ? `${label} [found: ${current}] keep? (Enter = keep, or type a new value): ` : `${label}: `)).trim();
    return a || current;
  };
  const out: InitAnswersInput = JSON.parse(JSON.stringify(input));
  log('\nA few questions. Everything scraped from the old site is shown as "found" — press Enter to keep it.\n');
  out.business.name = (await ask('Business name', out.business.name))!;
  out.business.tagline = await ask('One-line tagline', out.business.tagline);
  out.business.phone = await ask('Phone (E.164, e.g. +1-541-555-0100)', out.business.phone);
  out.business.email = await ask('Inbox for website messages', out.business.email);
  out.business.address = out.business.address ?? {};
  out.business.address.street = await ask('Street address', out.business.address.street);
  out.business.address.city = await ask('City', out.business.address.city);
  out.business.address.region = await ask('State/region', out.business.address.region);
  out.business.address.postalCode = await ask('Postal code', out.business.address.postalCode);
  out.owner = out.owner ?? { name: '' };
  out.owner.name = (await ask('Owner name (as shown on the site)', out.owner.name))!;
  out.owner.title = await ask('Owner title', out.owner.title);
  out.helper = { name: (await ask('Technical helper first name (for the DNS step)', out.helper?.name))! || 'your helper' };
  const v = await ask('Vertical (gym | clinic | studio | shop | generic)', out.vertical);
  if (v) out.vertical = v as InitAnswersInput['vertical'];
  const crm = await ask('CRM for leads (pushpress | gohighlevel | brevo-contact | none)', out.contact?.crm);
  const notify = await ask('Email notifier (brevo | resend | none)', out.contact?.notify);
  out.contact = { ...(out.contact ?? {}), crm: (crm as never) ?? 'none', notify: (notify as never) ?? 'none' };
  rl.close();
  void scrape;
  return out;
}

function run(cmd: string, cwd: string, env: Record<string, string> = {}): boolean {
  log(`\n$ ${cmd}`);
  try {
    execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
    return true;
  } catch {
    return false;
  }
}

export async function runInit(args: string[]): Promise<number> {
  const f = parseFlags(args);
  const dir = resolve(f.dir);
  mkdirSync(dir, { recursive: true });

  // Answers: file, then flags on top.
  let input: InitAnswersInput;
  if (f.answers) {
    const raw = JSON.parse(readFileSync(resolve(f.answers), 'utf8')) as InitAnswersInput;
    input = raw;
  } else {
    if (!f.name || !f.url) {
      console.error('jeldon init: pass --answers <file>, or at least --name "<Business>" --url https://<new-host> (and --from https://<old-site>).');
      return 1;
    }
    input = { business: { name: f.name, url: f.url }, owner: { name: 'TODO Owner Name' } } as InitAnswersInput;
  }
  if (f.name) input.business.name = f.name;
  if (f.url) input.business.url = f.url;
  if (f.from) input.business.oldUrl = f.from;
  if (f.crm) input.contact = { ...(input.contact ?? {}), crm: f.crm as never };
  if (f.notify) input.contact = { ...(input.contact ?? {}), notify: f.notify as never };
  if (f.kit) input.kit = f.kit as never;

  // 1. Scrape + baseline.
  let scrape: Scrape | null = null;
  const oldUrl = input.business.oldUrl;
  if (oldUrl && !f.noScrape) {
    scrape = await scrapeOldSite(oldUrl, { log });
    for (const e of scrape.errors) log(`  ⚠ ${e}`);
    mkdirSync(join(dir, 'data/benchmark'), { recursive: true });
    writeFileSync(join(dir, 'data/benchmark/scrape.json'), JSON.stringify({ ...scrape, posts: scrape.posts.map(({ body: _b, ...p }) => p) }, null, 2));
    if (!f.noBaseline) {
      log(`\nStoring the baseline scorecard for ${oldUrl} (the number the new site must beat)…`);
      try {
        const { baseline, measurements } = await captureBaseline(oldUrl, { psi: f.psi, psiKey: process.env.PAGESPEED_API_KEY, log, gbp: { street: input.business.address?.street, phone: input.business.phone } });
        writeFileSync(join(dir, 'data/benchmark/baseline.json'), JSON.stringify(baseline, null, 2));
        const card = buildScorecard({ oldUrl, newUrl: input.business.url, oldMeasurements: null, newMeasurements: measurements });
        writeFileSync(join(dir, 'data/benchmark/baseline-scorecard.md'), renderScorecardMarkdown({ ...card, oldUrl: null, newUrl: oldUrl }).replace('# Benchmark scorecard', '# Baseline scorecard (the OLD site)'));
        log(`  baseline stored: data/benchmark/baseline.json`);
      } catch (e) {
        log(`  ⚠ baseline failed: ${(e as Error).message}`);
      }
    }
  }

  // 2. Interview.
  const merged = await interview(mergeScrape(input, scrape), scrape, f.yes || Boolean(f.answers));
  const parsed = initAnswersSchema.safeParse(merged);
  if (!parsed.success) {
    console.error('Answers are invalid:\n' + parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n'));
    return 1;
  }
  const answers: InitAnswers = parsed.data;
  writeFileSync(join(dir, 'jeldon.answers.json'), JSON.stringify({ $schema: 'https://raw.githubusercontent.com/dryoung1029/jeldon/main/schemas/init-answers.schema.json', ...answers }, null, 2) + '\n');

  // 3. Generate.
  log(`\nGenerating ${answers.business.name} in ${dir} (kit: ${answers.kit}, vertical: ${answers.vertical})…`);
  const report = generate({ dir, answers, scrape, force: f.force, vendorFrom: f.vendorFrom, engineRange: f.engineRange, log });
  log(`  ${report.written.length} file(s) written, ${report.skipped.length} kept as-is`);
  if (report.templateMissingVars.length) log(`  ⚠ agent templates referenced unknown variables: ${report.templateMissingVars.join(', ')}`);

  // 4. Verify.
  let ok = true;
  if (!f.noInstall) {
    ok = run('npm install --no-audit --no-fund --loglevel=error', dir) && ok;
    ok = run('node node_modules/@jeldon/cli/dist/index.js validate', dir) && ok;
    ok = run('node node_modules/@jeldon/cli/dist/index.js doctor --pre', dir) && ok;
    ok = run('node node_modules/astro/astro.js build', dir) && ok;
    ok = run('node node_modules/astro/astro.js build', dir, { INCLUDE_DRAFTS: 'true' }) && ok;
  } else {
    log('\n(--no-install: skipping npm install + verification)');
  }

  // 5. Next step.
  log(`\n${ok ? '✔' : '✖'} jeldon init ${ok ? 'complete' : 'finished with errors'}: ${answers.business.name}`);
  log(`  SETUP markers left for the owner: ${report.setupMarkers}`);
  if (scrape) log(`  old site: ${scrape.sitemapUrls.length} URL(s) redirected, ${scrape.posts.length} post(s) migrated as drafts, vendor: ${scrape.templateVendor ?? 'unknown'}`);
  log(`  next: push this folder to a private GitHub repo, open it in Claude Code, and type /setup`);
  if (f.json) console.log(JSON.stringify({ ok, dir, setupMarkers: report.setupMarkers, written: report.written.length, routes: report.routes }, null, 2));
  return ok ? 0 : 1;
}

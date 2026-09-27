#!/usr/bin/env node
import { resolveConfigPath, validateDomainPack, loadDomainPack } from '@jeldon/config/load';
import { runDoctor, type DoctorCheck } from './doctor.js';
import { runCheckGeoFloor } from './check-geo-floor.js';
import { formatScorecard, runScore } from './score.js';

const ICON: Record<string, string> = { ok: '✔', warn: '⚠', error: '✖' };

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  const json = hasFlag(rest, '--json');

  switch (cmd) {
    case 'validate': {
      const path = resolveConfigPath();
      if (!path) {
        fail('No jeldon.config.ts found in the current directory.', json);
        return;
      }
      try {
        const pack = await loadDomainPack();
        // loadDomainPack already validates; re-run to collect structured issues
        const result = validateDomainPack(pack);
        if (result.ok) {
          if (json) console.log(JSON.stringify({ ok: true }, null, 2));
          else console.log(`${ICON.ok} ${path} is a valid Domain Pack`);
        } else {
          fail(result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'), json);
        }
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err), json);
      }
      return;
    }

    case 'doctor': {
      const report = await runDoctor({ pre: hasFlag(rest, '--pre') });
      if (json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        for (const c of report.checks) console.log(line(c));
        console.log(
          `\n${report.ok ? ICON.ok : ICON.error} doctor: ${report.errors} error(s), ${report.warnings} warning(s)`,
        );
      }
      if (!report.ok) process.exitCode = 1;
      return;
    }

    case 'check-geo-floor': {
      const files = rest.filter((a) => a.endsWith('.md'));
      try {
        const report = await runCheckGeoFloor({ files });
        if (json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          for (const r of report.results) {
            const cat = r.category || 'uncategorized';
            const msg = `${r.slug}: GEO ${r.score} ${r.ok ? '>=' : '<'} ${r.target} (${cat})`;
            if (r.ok) console.log(`${ICON.ok} ${msg}`);
            else console.error(`${ICON.error} ${msg}`);
          }
          const tail = report.skipped ? ` (${report.skipped} draft(s) skipped)` : '';
          console.log(
            `\n${report.ok ? ICON.ok : ICON.error} check-geo-floor: ${report.failed} of ${report.scored} scored article(s) below target${tail}`,
          );
        }
        if (!report.ok) process.exitCode = 1;
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err), json);
      }
      return;
    }

    case 'score': {
      const file = rest.find((a) => a.endsWith('.md'));
      if (!file) {
        fail('Usage: jeldon score <file.md> [--json]', json);
        return;
      }
      try {
        const report = await runScore({ file });
        if (json) console.log(JSON.stringify(report, null, 2));
        else console.log(formatScorecard(report));
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err), json);
      }
      return;
    }

    case 'brief': {
      const topic = rest.filter((a) => !a.startsWith('--')).join(' ').trim();
      try {
        const pack = await loadDomainPack();
        // Lazy: @jeldon/drafting is only paid for when the command runs.
        const { buildAgentBrief } = await import('@jeldon/drafting');
        const brief = buildAgentBrief(pack, { topic: topic || undefined });
        if (json) console.log(JSON.stringify({ topic: topic || null, brief }, null, 2));
        else console.log(brief);
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err), json);
      }
      return;
    }

    case 'init': {
      const { runInit } = await import('./init/index.js');
      try {
        const code = await runInit(rest);
        if (code) process.exitCode = code;
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err), json);
      }
      return;
    }

    case 'benchmark': {
      const { runBenchmarkCli } = await import('./benchmark-cli.js');
      try {
        const code = await runBenchmarkCli(rest);
        if (code) process.exitCode = code;
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err), json);
      }
      return;
    }

    default:
      console.log(
        [
          'jeldon <command>',
          '',
          '  validate                 Validate jeldon.config.ts against the Domain Pack schema',
          '  doctor [--pre]           Run the "wired correctly?" health check (--json for machines)',
          '  check-geo-floor [file…]  Score articles; fail if any are below their category target (drafts scored only when named)',
          '  score <file>             GEO + SEO + reading level for one file, as a plain-words scorecard (--json for machines)',
          '  brief [topic…]           Print the drafting brief for a coding agent (capabilities.drafting: "agent")',
          '  init [dir] [flags]       Spawn a site from a kit: scrape the old site, read --answers, generate, verify',
          '  benchmark [flags]        Score the new site against the old one on ten dimensions; --ci gates on "behind"',
          '',
          'Flags: --json  machine-readable output',
        ].join('\n'),
      );
      if (cmd && cmd !== 'help' && cmd !== '--help') process.exitCode = 1;
  }
}

function line(c: DoctorCheck): string {
  return `${ICON[c.status] ?? '?'} ${c.message}`;
}

function fail(message: string, json: boolean): void {
  if (json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  else console.error(`${ICON.error} ${message}`);
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

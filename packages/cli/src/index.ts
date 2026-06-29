#!/usr/bin/env node
import { resolveConfigPath, validateDomainPack, loadDomainPack } from '@jeldon/config';
import { runDoctor, type DoctorCheck } from './doctor.js';

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

    case 'init': {
      console.log(
        [
          'jeldon init is not yet wired to the Copier template generator.',
          'For now, scaffold a project with:',
          '',
          '  npx degit dryoung1029/jeldon/template my-site',
          '  cd my-site && pnpm install',
          '  # fill jeldon.config.ts (diff against examples/jeldon.config.example.ts)',
          '  npx jeldon doctor --pre',
          '',
          'See docs/IMPLEMENTATION.md for the full runbook.',
        ].join('\n'),
      );
      return;
    }

    default:
      console.log(
        [
          'jeldon <command>',
          '',
          '  validate           Validate jeldon.config.ts against the Domain Pack schema',
          '  doctor [--pre]     Run the "wired correctly?" health check (--json for machines)',
          '  init               Scaffold a new project (see docs/IMPLEMENTATION.md)',
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

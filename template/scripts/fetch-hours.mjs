#!/usr/bin/env node
// Refresh opening hours from the Google Business Profile (Places Place
// Details) into the hours data file (`pack.brand.hours.dataFile`, default
// src/data/hours.json). Run it from a daily cron; the site picks the file up
// on the next build.
//
// Credentials are read from the env vars NAMED in `pack.services.places`.
// Missing credentials: exits 0 with a warning and writes nothing (so the cron
// does not fail), but says loudly that hours are NOT being refreshed.
// A failed call or empty weekly hours: exits 1 and writes nothing. Google's
// special days are merged with hand-entered ones (Google wins on a shared
// date, past dates dropped); if Google sent no special-days data, the stored
// special hours are left as they were.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadDomainPack } from '@jeldon/config';
import { fetchPlaceHours, hoursFromPack, refreshHoursData, zonedDate } from '@jeldon/business-info';

const pack = await loadDomainPack();
const places = pack.services.places;
const dataFile = pack.brand.hours?.dataFile ?? 'src/data/hours.json';

if (!places) {
  console.log('[fetch-hours] services.places is not set in jeldon.config.ts — nothing to refresh.');
  process.exit(0);
}

const result = await fetchPlaceHours({
  apiKey: process.env[places.apiKeyEnv],
  placeId: process.env[places.placeIdEnv],
});

if (result.status === 'not_configured') {
  console.log(`[fetch-hours] ${places.apiKeyEnv} or ${places.placeIdEnv} missing — skipping.`);
  console.log(`::warning::fetch-hours skipped — Places credentials not configured; ${dataFile} is NOT being refreshed.`);
  process.exit(0);
}
if (result.status === 'error') {
  console.error(`[fetch-hours] ${result.reason}. ${dataFile} left unchanged.`);
  process.exit(1);
}

let existing = null;
try {
  existing = JSON.parse(await readFile(dataFile, 'utf8'));
} catch {
  // First run: seed manual special hours from the pack so they survive the merge.
  existing = pack.brand.hours ? { ...hoursFromPack(pack.brand.hours), regularHours: [] } : null;
}

const { data, unchanged } = refreshHoursData(existing, result, { today: zonedDate(pack.content.timezone) });
await mkdir(dirname(dataFile), { recursive: true });
await writeFile(dataFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(
  unchanged
    ? `[fetch-hours] Hours unchanged since ${data.fetchedAt}; recorded checkedAt=${data.checkedAt}.`
    : `[fetch-hours] Wrote ${dataFile} (${data.regularHours.length} open days, ${data.specialHours.length} special dates).`,
);
if (result.specialDays === null) console.log('[fetch-hours] Google returned no current_opening_hours; special hours left as they were.');

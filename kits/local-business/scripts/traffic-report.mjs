#!/usr/bin/env node
/**
 * Traffic report from Google Search Console CSV exports (no API needed).
 * Search Console → Performance → Export → Download CSV → unzip → drop the
 * CSVs into data/search-console/ (a folder per export keeps history).
 * Parsing/aggregation lives in @jeldon/crawler-analytics; this is the fs shell.
 */
import { buildTrafficReport } from '@jeldon/kit-local-business/node';

const { report, files } = await buildTrafficReport('data/search-console');
console.log(report);
console.log(files.length ? `\nWrote data/search-console/report.md (${files.length} CSV file(s))` : '');

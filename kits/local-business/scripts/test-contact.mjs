#!/usr/bin/env node
/**
 * Send a test message through the live contact form endpoint.
 *   node scripts/test-contact.mjs https://<project>.<account>.workers.dev
 * Expect 200 {"ok":true}. Then check the inbox and the CRM. Each run creates a
 * new test contact — delete them afterwards.
 */
import { sendTestContact } from '@jeldon/kit-local-business/node';

const base = process.argv[2];
if (!base) {
  console.error('Usage: node scripts/test-contact.mjs <site url>');
  process.exit(1);
}
const { status, body } = await sendTestContact(base);
console.log(status, body);
process.exit(status === 200 ? 0 : 1);

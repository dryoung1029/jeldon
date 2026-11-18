import { describe, expect, it } from 'vitest';
import { defaultSiteAlertConfig } from '@jeldon/config';
import {
  alertState,
  autoLabel,
  dismissalKey,
  displayLabel,
  homepageShows,
  isWallClock,
  messageHtml,
  normalizeAlert,
  parseStoredAlert,
  presetAlerts,
  stampAlert,
  waitForLiveVersion,
  wallClockIn,
  ALERT_TEMPLATE_ID,
} from '../src/index.js';

const limits = defaultSiteAlertConfig.limits;
const TZ = 'America/New_York';

describe('wall clock', () => {
  it('validates real dates only', () => {
    expect(isWallClock('2026-11-17T08:00')).toBe(true);
    expect(isWallClock('2026-02-30T08:00')).toBe(false);
    expect(isWallClock('2026-11-17T24:00')).toBe(false);
    expect(isWallClock('2026-11-17 08:00')).toBe(false);
    expect(isWallClock(42)).toBe(false);
  });

  it('reads the wall clock in the configured zone across DST', () => {
    // 2026-07-01 16:30Z is 12:30 EDT (UTC-4); 2026-12-01 16:30Z is 11:30 EST.
    expect(wallClockIn(TZ, new Date('2026-07-01T16:30:00Z'))).toBe('2026-07-01T12:30');
    expect(wallClockIn(TZ, new Date('2026-12-01T16:30:00Z'))).toBe('2026-12-01T11:30');
    // Same instant, different zone, different calendar day.
    expect(wallClockIn('Pacific/Auckland', new Date('2026-12-01T16:30:00Z'))).toBe('2026-12-02T05:30');
    expect(wallClockIn('UTC', new Date('2026-12-01T00:00:00Z'))).toBe('2026-12-01T00:00');
  });
});

describe('alertState', () => {
  const a = { enabled: true, startsAt: '2026-11-17T08:00', endsAt: '2026-11-17T23:59' };
  it('one minute before / at start / end minute inclusive / one minute after', () => {
    expect(alertState(a, '2026-11-17T07:59')).toBe('scheduled');
    expect(alertState(a, '2026-11-17T08:00')).toBe('live');
    expect(alertState(a, '2026-11-17T23:59')).toBe('live');
    expect(alertState(a, '2026-11-18T00:00')).toBe('ended');
  });
  it('off when disabled or when the window is unparseable', () => {
    expect(alertState({ ...a, enabled: false }, '2026-11-17T09:00')).toBe('off');
    expect(alertState({ ...a, startsAt: '' }, '2026-11-17T09:00')).toBe('off');
  });
});

describe('labels', () => {
  it('derives one-day and multi-day labels', () => {
    expect(autoLabel({ startsAt: '2026-11-17T00:00', endsAt: '2026-11-17T23:59' })).toBe('TODAY · TUESDAY, NOV 17');
    expect(autoLabel({ startsAt: '2026-11-17T00:00', endsAt: '2026-11-20T23:59' })).toBe('NOTICE · NOV 17 – NOV 20');
    expect(displayLabel({ label: 'heads up', startsAt: '', endsAt: '' })).toBe('HEADS UP');
  });
});

describe('messageHtml', () => {
  it('escapes HTML so nothing typed becomes markup', () => {
    const html = messageHtml('<img src=x onerror=alert(1)> & <script>bad()</script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &lt;script&gt;');
  });

  it('links https URLs and email addresses only', () => {
    const html = messageHtml('See https://example.com/status. Or write to help@example.org.');
    expect(html).toContain('<a href="https://example.com/status" rel="noopener">https://example.com/status</a>.');
    expect(html).toContain('<a href="mailto:help@example.org">help@example.org</a>.');
  });

  it('leaves javascript:, data: and plain http: inert', () => {
    const html = messageHtml('javascript:alert(1) data:text/html,<b>x</b> http://example.com');
    expect(html).not.toContain('<a');
    expect(html).toContain('javascript:alert(1)');
    expect(html).toContain('http://example.com');
  });

  it('cannot break out of the href attribute', () => {
    const html = messageHtml('https://example.com/"onmouseover="alert(1) https://e.com/\'x');
    expect(html).not.toMatch(/href="[^"]*"onmouseover/);
    expect(html).toContain('href="https://example.com/"');
    expect(html).not.toContain("'x\"");
  });

  it('does not treat an address inside a URL as an email', () => {
    const html = messageHtml('https://example.com/u/me@example.com');
    expect(html).not.toContain('mailto:');
  });

  it('turns blank lines into paragraph breaks and newlines into <br>', () => {
    expect(messageHtml('one\ntwo\n\nthree')).toBe('one<br>two<br><br>three');
    expect(messageHtml('   ')).toBe('');
  });
});

describe('normalizeAlert', () => {
  const ok = { enabled: true, title: 'Closed today', message: 'x', startsAt: '2026-11-17T00:00', endsAt: '2026-11-17T23:59' };

  it('accepts a valid alert and drops unknown fields', () => {
    const { alert, errors } = normalizeAlert({ ...ok, evil: '<script>' }, limits);
    expect(errors).toEqual([]);
    expect(alert).not.toHaveProperty('evil');
    expect(alert.revision).toBe('');
  });

  it('requires a title and a valid window', () => {
    expect(normalizeAlert({ ...ok, title: '  ' }, limits).errors).toContain('Add a title.');
    expect(normalizeAlert({ ...ok, startsAt: 'soon' }, limits).errors).toContain('Start needs a valid date and time.');
    expect(normalizeAlert({ ...ok, endsAt: '2026-11-16T23:59' }, limits).errors).toContain('End must be after the start.');
  });

  it('enforces the pack limits', () => {
    const small = { label: 5, title: 10, message: 20, maxDays: 2 };
    const { alert, errors } = normalizeAlert(
      { ...ok, label: 'a very long label', title: 'x'.repeat(50), message: 'y'.repeat(50), endsAt: '2026-11-20T00:00' },
      small,
    );
    expect(alert.label.length).toBeLessThanOrEqual(5);
    expect(alert.title.length).toBe(10);
    expect(alert.message.length).toBe(20);
    expect(errors).toContain('An alert can run at most 2 days.');
  });

  it('collapses title newlines and normalises CRLF', () => {
    const { alert } = normalizeAlert({ ...ok, title: 'a\r\nb', message: 'p1\r\n\r\np2' }, limits);
    expect(alert.title).toBe('a b');
    expect(alert.message).toBe('p1\n\np2');
  });
});

describe('revision + dismissal', () => {
  it('stamps a revision server-side and keys dismissal per revision', () => {
    const { alert } = normalizeAlert({ title: 't', startsAt: '2026-11-17T00:00', endsAt: '2026-11-17T01:00' }, limits);
    const s1 = stampAlert(alert, new Date('2026-11-17T10:00:00Z'));
    const s2 = stampAlert(alert, new Date('2026-11-17T10:05:00Z'));
    expect(s1.revision).not.toBe(s2.revision);
    expect(dismissalKey(s1.revision)).not.toBe(dismissalKey(s2.revision));
    expect(dismissalKey('r1', 'site:alert')).toBe('site:alert:r1');
  });

  it('parses a stored file defensively', () => {
    expect(parseStoredAlert('not json', limits).enabled).toBe(false);
    expect(parseStoredAlert(null, limits).title).toBe('');
    const p = parseStoredAlert(JSON.stringify({ enabled: true, title: 't', revision: 'r9', updatedAt: 'x' }), limits);
    expect(p.revision).toBe('r9');
  });
});

describe('presetAlerts', () => {
  const presets = {
    closed: { name: 'Closed today', title: 'We are closed today', message: 'Email {email} and we will reply.' },
  };
  it('fills today in the zone and substitutes contact details', () => {
    const out = presetAlerts(presets, '2026-11-17T09:12', { email: 'hello@example.com' });
    expect(out.closed).toMatchObject({
      startsAt: '2026-11-17T00:00',
      endsAt: '2026-11-17T23:59',
      message: 'Email hello@example.com and we will reply.',
      emailButton: true,
    });
  });
  it('forces the email button off when no contact email is configured', () => {
    expect(presetAlerts(presets, '2026-11-17T09:12').closed!.emailButton).toBe(false);
  });
});

describe('live check', () => {
  const on = { enabled: true, revision: '2026-11-17T10:00:00.000Z' };
  const page = (rev?: string) =>
    rev ? `<html><template id="${ALERT_TEMPLATE_ID}" data-rev="${rev}"></template></html>` : '<html></html>';

  it('matches on the saved revision, or on no template when off', () => {
    expect(homepageShows(page(on.revision), on)).toBe(true);
    expect(homepageShows(page('older'), on)).toBe(false);
    expect(homepageShows(page(), { enabled: false, revision: 'x' })).toBe(true);
    expect(homepageShows(page('older'), { enabled: false, revision: 'x' })).toBe(false);
  });

  it('an already-ended alert counts as matched', () => {
    const ended = { ...on, startsAt: '2026-11-16T00:00', endsAt: '2026-11-16T23:59' };
    expect(homepageShows(page('older'), ended, '2026-11-17T09:00')).toBe(true);
  });

  it('polls through a stale build (deploy race) and network blips until live', async () => {
    let t = 0;
    const responses: Array<string | Error> = [page('older'), new Error('offline'), page('older'), page(on.revision)];
    const misses: number[] = [];
    const res = await waitForLiveVersion(
      async () => {
        const r = responses.shift()!;
        if (r instanceof Error) throw r;
        return r;
      },
      on,
      8 * 60_000,
      { intervalMs: 15_000, clock: () => t, sleep: async (ms) => void (t += ms), onMiss: (i) => misses.push(i.attempts) },
    );
    expect(res).toEqual({ status: 'live', attempts: 4, elapsedMs: 45_000 });
    expect(misses).toEqual([1, 2, 3]);
  });

  it('times out instead of claiming live', async () => {
    let t = 0;
    const res = await waitForLiveVersion(async () => page('older'), on, 60_000, {
      intervalMs: 15_000,
      clock: () => t,
      sleep: async (ms) => void (t += ms),
    });
    // Attempts at 0, 15, 30, 45 and 60 s: the last one lands on the deadline.
    expect(res.status).toBe('timeout');
    expect(res.attempts).toBe(5);
    expect(res.elapsedMs).toBe(60_000);
  });
});

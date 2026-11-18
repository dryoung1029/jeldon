import { describe, expect, it } from 'vitest';
import { defaultAnalyticsConfig, defaultLeadsConfig } from '@jeldon/config';
import {
  attributionSnippet,
  automapColumns,
  buildConversionMap,
  buildTrends,
  hashBookingRow,
  hashId,
  leadChannel,
  leadsOptionsFromPack,
  matchBookings,
  normEmail,
  normPhone,
  parseBookingDate,
  parseCsv,
  presetById,
  requestContextFor,
  sanitizeAttribution,
  sanitizeHashedRows,
  type TrendLead,
} from '../src/index.js';

const TZ = 'America/New_York';

describe('sanitizeAttribution', () => {
  it('keeps a path-only landing page, a hostname-only referrer and whitelisted UTMs', () => {
    const a = sanitizeAttribution({
      landingPage: '/articles/x/?email=someone@example.com#top',
      referrer: 'https://www.google.com/search?q=private+question',
      utm: { utm_source: 'news<script>letter', utm_medium: 'email', utm_term: 'secret', gclid: 'abc' },
    });
    expect(a.landingPage).toBe('/articles/x/');
    expect(a.referrer).toBe('www.google.com');
    expect(a.utm).toEqual({ utm_source: 'newsscriptletter', utm_medium: 'email' });
  });

  it('rejects non-path landings and caps lengths', () => {
    expect(sanitizeAttribution({ landingPage: 'javascript:alert(1)' }).landingPage).toBeUndefined();
    expect(sanitizeAttribution({ landingPage: '//evil.example/x' }).landingPage).toBeUndefined();
    expect(sanitizeAttribution({ landingPage: 'https://site.example/a/b?x=1' }).landingPage).toBe('/a/b');
    const long = sanitizeAttribution({ landingPage: '/' + 'a'.repeat(500), utm_source: 'x'.repeat(100) });
    expect(long.landingPage!.length).toBe(defaultLeadsConfig.attribution.maxLandingChars);
    expect(long.utm.utm_source!.length).toBe(defaultLeadsConfig.attribution.maxUtmChars);
  });

  it('clamps phone taps and keeps calledAt only when there was a tap', () => {
    expect(sanitizeAttribution({ phoneClicks: '500', calledAt: '2026-10-20T10:00:00Z' })).toMatchObject({ phoneClicks: 99, calledAt: '2026-10-20T10:00:00Z' });
    expect(sanitizeAttribution({ phoneClicks: '0', calledAt: '2026-10-20T10:00:00Z' }).calledAt).toBeUndefined();
    // Absent is not zero: a pre-capture lead carries no phone field at all.
    expect('phoneClicks' in sanitizeAttribution({})).toBe(false);
  });

  it('ships a snippet that arms the tap listener in its own block and uses the configured prefix', () => {
    const s = attributionSnippet({ ...defaultLeadsConfig.attribution, storagePrefix: 'acme:' });
    expect(s).toContain('"acme:"');
    expect(s).toContain('a[href^="tel:"]');
    expect(s).toContain('window.jeldonFirstTouch');
    expect(s).not.toContain('boh:');
  });
});

describe('leadChannel', () => {
  const analytics = { ...defaultAnalyticsConfig, ownHosts: ['site.example'] };
  it('prefers the UTM source, then the referrer host, through the shared classifier', () => {
    expect(leadChannel({ utm: { utm_source: 'newsletter' }, referrer: 'www.google.com' }, analytics)).toBe('Newsletter');
    expect(leadChannel({ referrer: 'old.reddit.com', landingPage: '/' }, analytics)).toBe('Reddit');
    // Hostname-anchored: t.com hosts are not X.
    expect(leadChannel({ referrer: 'chatgpt.com' }, analytics)).toBe('ChatGPT');
  });
  it('separates direct from no data', () => {
    expect(leadChannel({ landingPage: '/' }, analytics)).toBe(analytics.directLabel);
    expect(leadChannel({ referrer: 'site.example', landingPage: '/' }, analytics)).toBe(analytics.directLabel);
    expect(leadChannel({}, analytics)).toBe('Unknown');
  });
});

describe('buildTrends', () => {
  const now = Date.parse('2026-06-20T12:00:00Z');
  // Typical lag ~30 days.
  const leads: TrendLead[] = [
    { receivedAt: '2026-01-10T15:00:00Z', status: 'booked', bookedAt: '2026-02-09' },
    { receivedAt: '2026-01-20T15:00:00Z', status: 'booked', bookedAt: '2026-03-01' },
    { receivedAt: '2026-02-05T15:00:00Z', status: 'booked', bookedAt: '2026-03-07' },
    { receivedAt: '2026-03-15T15:00:00Z', status: 'contacted' },
    { receivedAt: '2026-06-02T15:00:00Z' },
    { receivedAt: '2026-06-03T15:00:00Z', spam: true },
  ];

  it('flags buckets younger than the median lead→booking lag as maturing', () => {
    const t = buildTrends(leads, { timezone: TZ, bucket: 'month', now });
    expect(t.medianLagDays).toBe(30);
    expect(t.maturity).toBe('median-lag');
    const pts = Object.fromEntries(t.series[0]!.points.map((p) => [p.key, p]));
    expect(pts['2026-01']!.maturing).toBe(false);
    expect(pts['2026-02']!.maturing).toBe(false);
    expect(pts['2026-05']!.maturing).toBe(true); // ended 2026-06-01, 19 days < 30-day lag
  });

  it('maturing is judged against bucket END in the business timezone', () => {
    const t = buildTrends(leads, { timezone: TZ, bucket: 'month', now });
    const pts = Object.fromEntries(t.series[0]!.points.map((p) => [p.key, p]));
    // June has not ended; May ended 19 days before `now`, under the 30-day lag.
    expect(pts['2026-06']!.maturing).toBe(true);
    expect(t.keys).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
    expect(pts['2026-04']!.leads).toBe(0); // gap, not a missing x-value
    expect(pts['2026-04']!.bookedRate).toBeNull();
  });

  it('says maturity is unknown, not mature, when nothing has booked', () => {
    const t = buildTrends([{ receivedAt: '2026-06-01T12:00:00Z' }], { timezone: TZ, now });
    expect(t.medianLagDays).toBeNull();
    expect(t.maturity).toBe('unknown');
  });

  it('switches date basis: the same bookings land in different periods', () => {
    const byLead = buildTrends(leads, { timezone: TZ, basis: 'lead', now });
    const byBooking = buildTrends(leads, { timezone: TZ, basis: 'booking', now });
    const get = (t: typeof byLead, k: string) => t.series[0]!.points.find((p) => p.key === k);
    expect(get(byLead, '2026-01')!.booked).toBe(2);
    expect(get(byBooking, '2026-01')).toBeUndefined();
    expect(get(byBooking, '2026-02')!.booked).toBe(1);
    // A date-only booking on the 1st stays on the 1st (parsing it as a UTC
    // instant would put it on Feb 28 in a timezone west of UTC).
    expect(get(byBooking, '2026-03')!.booked).toBe(2);
    expect(byBooking.undated).toBe(2); // the two unbooked, non-spam leads
    expect(byBooking.basis).toBe('booking');
  });

  it('buckets by the business-timezone calendar and Monday weeks', () => {
    // 9:30pm Sunday in New York is Monday in UTC.
    const t = buildTrends([{ receivedAt: '2026-03-02T02:30:00Z' }], { timezone: TZ, bucket: 'week', now });
    expect(t.keys).toEqual(['2026-02-23']); // the Monday of the local Sunday's week
    const utc = buildTrends([{ receivedAt: '2026-03-02T02:30:00Z' }], { timezone: 'UTC', bucket: 'week', now });
    expect(utc.keys).toEqual(['2026-03-02']);
  });

  it('existing clients leave both sides of the booked rate', () => {
    const t = buildTrends(
      [
        { receivedAt: '2026-01-05T12:00:00Z', status: 'booked', bookedAt: '2026-01-02', existing: true },
        { receivedAt: '2026-01-06T12:00:00Z', status: 'booked', bookedAt: '2026-01-20' },
        { receivedAt: '2026-01-07T12:00:00Z' },
      ],
      { timezone: TZ, now },
    );
    expect(t.series[0]!.points[0]!.bookedRate).toBe(0.5);
  });
});

describe('buildConversionMap', () => {
  it('flags cells under minLeads as low-sample without hiding or zeroing them', () => {
    const map = buildConversionMap(
      [
        { path: '/articles/a', human: 100 },
        { path: '/articles/b/', human: 50 },
        { path: '/about/', human: 10 },
      ],
      [
        { id: '1', landingPage: '/articles/a/', channel: 'Google Search', status: 'booked' },
        { id: '2', landingPage: '/articles/a/', channel: 'Google Search' },
        { id: '3', landingPage: '/articles/a/', channel: 'Reddit' },
        { id: '4', landingPage: '/articles/b/', channel: 'Reddit' },
        { id: '5', landingPage: '/articles/b/', channel: 'Reddit', existing: true, status: 'booked' },
        { id: '6', channel: 'Unknown', spam: true },
        { id: '7', channel: 'Unknown' },
      ],
      [{ leadId: '4' }],
      { minLeads: 3 },
    );
    const a = map.pages.find((p) => p.path === '/articles/a/')!;
    const b = map.pages.find((p) => p.path === '/articles/b/')!;
    const about = map.pages.find((p) => p.path === '/about/')!;
    expect(a.views.human).toBe(100);
    expect(a.landed).toEqual({ leads: 3, booked: 1, rate: 1 / 3, lowSample: false });
    expect(a.channels['Google Search']).toEqual({ leads: 2, booked: 1, rate: 0.5, lowSample: true });
    expect(b.landed).toEqual({ leads: 1, booked: 1, rate: 1, lowSample: true }); // booked via the bookings list
    expect(about.landed.rate).toBeNull(); // no leads: no rate, not 0%
    expect(map.unattributed.leads).toBe(1);
    expect(map.totals.leads).toBe(5);
    expect(map.byChannel['Reddit']).toEqual({ leads: 2, booked: 1, rate: 0.5, lowSample: true });
  });
});

describe('booking import', () => {
  it('hashes identically in the browser path and the server path', async () => {
    expect(await hashId('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(normEmail('  Ann@Example.ORG ')).toBe('ann@example.org');
    expect(normPhone('+1 (541) 555-0100')).toBe('5415550100');
    expect(normPhone('555-0100')).toBe('');

    const browserRow = await hashBookingRow({ email: ' ANN@example.org', phone: '1-541-555-0100', date: '3/5/2026' });
    expect(browserRow).toEqual({ e: await hashId('ann@example.org'), p: await hashId('5415550100'), d: '2026-03-05' });

    const clean = sanitizeHashedRows([browserRow, { e: 'not-a-hash' }]);
    expect(clean.ok).toBe(true);
    const { updates, summary } = await matchBookings(
      [
        { id: 'L1', receivedAt: '2026-03-01T10:00:00Z', email: 'ann@example.org', phone: '(541) 555 0100' },
        { id: 'L2', receivedAt: '2026-03-02T10:00:00Z', email: 'bob@example.org' },
      ],
      clean.ok ? clean.rows : [],
      { skipped: 2 },
    );
    expect(updates).toEqual([{ id: 'L1', status: 'booked', bookedAt: '2026-03-05', previous: 'new', via: 'email', existing: false }]);
    expect(summary).toMatchObject({ rows: 3, matched: 1, unmatched: 2, noIdentifier: 2, updated: 1 });
  });

  it('marks a first visit before the form as an existing client, and falls back to phone', async () => {
    const row = (await hashBookingRow({ phone: '541.555.0100', date: '2026-01-01' }))!;
    const { updates } = await matchBookings([{ id: 'L1', receivedAt: '2026-03-01T10:00:00Z', phone: '5415550100' }], [row]);
    expect(updates[0]).toMatchObject({ via: 'phone', existing: true });
  });

  it('automaps columns from preset DATA (generic and Jane)', () => {
    const cfg = defaultLeadsConfig.bookingImport;
    const jane = presetById(cfg, 'jane');
    expect(automapColumns(['First Name', 'Email', 'Home Phone', 'Mobile Phone', 'First Visit'], jane)).toEqual({
      email: 'Email',
      phone: 'Mobile Phone',
      date: 'First Visit',
    });
    const generic = presetById(cfg);
    expect(generic.id).toBe('generic');
    expect(automapColumns(['Client', 'E-mail Address', 'Tel', 'Date'], generic)).toEqual({ email: 'E-mail Address', phone: 'Tel', date: 'Date' });
    expect(automapColumns(['Name'], generic)).toEqual({ email: null, phone: null, date: null });
    // A pack-supplied preset needs no code.
    const custom = { id: 'x', label: 'X', columns: { email: ['^correo$'], phone: ['^tel'], date: ['^fecha'] } };
    expect(automapColumns(['correo', 'telefono', 'fecha_cita'], custom)).toEqual({ email: 'correo', phone: 'telefono', date: 'fecha_cita' });
  });

  it('parses quoted CSV and common date shapes', () => {
    const { headers, rows } = parseCsv('﻿Name,Email\r\n"Doe, Jane","j@x.org"\r\n\r\n');
    expect(headers).toEqual(['Name', 'Email']);
    expect(rows).toEqual([{ Name: 'Doe, Jane', Email: 'j@x.org' }]);
    expect(parseBookingDate('Mar 5, 2026')).toBe('2026-03-05');
    expect(parseBookingDate('5 Sept 2026')).toBe('2026-09-05');
    expect(parseBookingDate('2026-13-01')).toBeNull();
  });
});

describe('request context and pack wiring', () => {
  it('is explicit about an unconfigured pack and merges cluster copy over the default', () => {
    expect(requestContextFor(['x'], undefined)).toMatchObject({ configured: false });
    const cfg = {
      minLeads: 3,
      requestContexts: {
        default: { topic: '', visitType: 'General', headline: 'H', sub: 'S' },
        byCluster: { widgets: { topic: 'widgets', headline: 'Widget trouble?' } },
      },
    };
    expect(requestContextFor(['none', 'widgets'], cfg)).toEqual({
      configured: true,
      clusterId: 'widgets',
      context: { topic: 'widgets', visitType: 'General', headline: 'Widget trouble?', sub: 'S' },
    });
  });

  it('uses content.timezone as the business timezone and adds the site host to ownHosts', () => {
    const o = leadsOptionsFromPack({
      brand: { name: 'Acme', siteUrl: 'https://www.acme.example' },
      content: { categories: ['a'], categoryTargets: {}, defaultAuthorSlug: 'x', timezone: 'Europe/Berlin' },
    });
    expect(o.timezone).toBe('Europe/Berlin');
    expect(o.analytics.ownHosts).toContain('acme.example');
    expect(o.conversion.minLeads).toBe(3);
  });
});

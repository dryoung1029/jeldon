import { describe, expect, it } from 'vitest';
import type { HoursData, SpecialHours } from '@jeldon/config';
import {
  buildRegularHours,
  describeOpenStatus,
  fetchPlaceHours,
  googleSpecialDays,
  hoursFromPack,
  isOpenNow,
  mergeSpecialHours,
  refreshHoursData,
  zonedDate,
} from '../src/index.js';

const TZ = 'America/Chicago';

describe('googleSpecialDays', () => {
  it('a listed date with no period is a closure; with periods a one-off schedule', () => {
    const out = googleSpecialDays({
      periods: [
        { open: { day: 1, time: '0800', date: '2026-11-23' }, close: { day: 1, time: '1200', date: '2026-11-23' } },
        { open: { day: 2, time: '0800', date: '2026-11-24' }, close: { day: 2, time: '1700', date: '2026-11-24' } },
      ],
      special_days: [{ date: '2026-11-26' }, { date: '2026-11-23' }, { date: '2026-11-26' }, { date: 'bad' }],
    });
    expect(out).toEqual([
      { date: '2026-11-23', intervals: [{ opens: '08:00', closes: '12:00' }], source: 'google' },
      { date: '2026-11-26', intervals: [], source: 'google' },
    ]);
  });

  it('null when Google sent nothing; [] when it answered with no special days', () => {
    expect(googleSpecialDays(undefined)).toBeNull();
    expect(googleSpecialDays({})).toBeNull();
    expect(googleSpecialDays({ periods: [] })).toEqual([]);
  });
});

describe('mergeSpecialHours', () => {
  const today = '2026-11-20';
  const manual: SpecialHours = { date: '2026-12-24', intervals: [{ opens: '08:00', closes: '12:00' }], label: 'Christmas Eve' };
  const manualShared: SpecialHours = { date: '2026-11-26', intervals: [{ opens: '09:00', closes: '10:00' }] };
  const oldGoogle: SpecialHours = { date: '2026-11-22', intervals: [], source: 'google' };
  const past: SpecialHours = { date: '2026-11-01', intervals: [] };

  it('Google wins on a shared date, manual entries are kept, old Google entries replaced, past dropped', () => {
    const google: SpecialHours[] = [{ date: '2026-11-26', intervals: [], source: 'google' }];
    const out = mergeSpecialHours([past, oldGoogle, manualShared, manual], google, today);
    expect(out).toEqual([{ date: '2026-11-26', intervals: [], source: 'google' }, manual]);
  });

  it('tags Google entries even if the caller forgot', () => {
    const out = mergeSpecialHours([], [{ date: '2026-11-26', intervals: [] }], today);
    expect(out[0]!.source).toBe('google');
  });

  it('drops past Google dates too', () => {
    expect(mergeSpecialHours([], [{ date: '2026-11-19', intervals: [], source: 'google' }], today)).toEqual([]);
  });

  it('a failed fetch (null) leaves stored hours untouched; an empty list clears Google entries', () => {
    const stored = [oldGoogle, manual];
    expect(mergeSpecialHours(stored, null, today)).toEqual(stored);
    expect(mergeSpecialHours(stored, [], today)).toEqual([manual]);
  });
});

describe('buildRegularHours', () => {
  it('keeps split shifts sorted and treats a missing close as all day', () => {
    expect(
      buildRegularHours([
        { open: { day: 1, time: '1300' }, close: { day: 1, time: '1800' } },
        { open: { day: 1, time: '0800' }, close: { day: 1, time: '1200' } },
        { open: { day: 6, time: '0000' } },
        { open: { day: 9, time: '0800' } },
      ]),
    ).toEqual([
      { day: 'Monday', intervals: [{ opens: '08:00', closes: '12:00' }, { opens: '13:00', closes: '18:00' }] },
      { day: 'Saturday', intervals: [{ opens: '00:00', closes: '23:59' }] },
    ]);
  });
});

describe('fetchPlaceHours (injected fetch)', () => {
  const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

  it('not_configured without credentials, and makes no request', async () => {
    let called = false;
    const r = await fetchPlaceHours({ apiKey: '', placeId: 'p', fetch: (async () => ((called = true), new Response())) as unknown as typeof fetch });
    expect(r.status).toBe('not_configured');
    expect(called).toBe(false);
  });

  it('refuses to report empty weekly hours as an answer', async () => {
    const r = await fetchPlaceHours({ apiKey: 'k', placeId: 'p', fetch: ok({ status: 'OK', result: { opening_hours: { periods: [] } } }) });
    expect(r.status).toBe('error');
  });

  it('surfaces HTTP and API errors', async () => {
    const r1 = await fetchPlaceHours({ apiKey: 'k', placeId: 'p', fetch: (async () => new Response('x', { status: 403 })) as unknown as typeof fetch });
    expect(r1).toEqual({ status: 'error', reason: 'HTTP 403' });
    const r2 = await fetchPlaceHours({ apiKey: 'k', placeId: 'p', fetch: ok({ status: 'REQUEST_DENIED', error_message: 'bad key' }) });
    expect(r2.status).toBe('error');
    const r3 = await fetchPlaceHours({ apiKey: 'k', placeId: 'p', fetch: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
    expect(r3).toEqual({ status: 'error', reason: 'offline' });
  });

  it('parses regular + special hours and sends the place id', async () => {
    let url = '';
    const r = await fetchPlaceHours({
      apiKey: 'k',
      placeId: 'place-1',
      fetch: (async (u: string) => {
        url = u;
        return new Response(
          JSON.stringify({
            status: 'OK',
            result: {
              opening_hours: { periods: [{ open: { day: 1, time: '0800' }, close: { day: 1, time: '1700' } }] },
              current_opening_hours: { periods: [], special_days: [{ date: '2026-11-26' }] },
            },
          }),
        );
      }) as unknown as typeof fetch,
    });
    expect(new URL(url).searchParams.get('place_id')).toBe('place-1');
    expect(r).toEqual({
      status: 'ok',
      regularHours: [{ day: 'Monday', intervals: [{ opens: '08:00', closes: '17:00' }] }],
      specialDays: [{ date: '2026-11-26', intervals: [], source: 'google' }],
    });
  });
});

describe('refreshHoursData', () => {
  const regular = [{ day: 'Monday' as const, intervals: [{ opens: '08:00', closes: '17:00' }] }];
  it('keeps fetchedAt when nothing changed but always moves checkedAt', () => {
    const existing: HoursData = { fetchedAt: '2026-06-01T00:00:00.000Z', checkedAt: null, source: 'google-places', regularHours: regular, specialHours: [] };
    const now = new Date('2026-11-17T12:00:00Z');
    const r = refreshHoursData(existing, { status: 'ok', regularHours: regular, specialDays: [] }, { today: '2026-11-17', now });
    expect(r.unchanged).toBe(true);
    expect(r.data.fetchedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(r.data.checkedAt).toBe(now.toISOString());
    const r2 = refreshHoursData(existing, { status: 'ok', regularHours: regular, specialDays: [{ date: '2026-11-26', intervals: [] }] }, { today: '2026-11-17', now });
    expect(r2.unchanged).toBe(false);
    expect(r2.data.fetchedAt).toBe(now.toISOString());
  });
});

describe('isOpenNow', () => {
  // Mon–Fri 08:00–17:30, Sat 09:00–12:00. Chicago is UTC-6 in November.
  const hours = hoursFromPack({
    regular: [
      ...(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const).map((day) => ({ day, intervals: [{ opens: '08:00', closes: '17:30' }] })),
      { day: 'Saturday', intervals: [{ opens: '09:00', closes: '12:00' }] },
    ],
    special: [{ date: '2026-11-26', intervals: [] }],
  });
  const at = (iso: string) => isOpenNow(hours, new Date(iso), TZ);

  it('open with closing time, in the business zone not the host zone', () => {
    // Tue 2026-11-17 10:00 CST = 16:00Z.
    expect(at('2026-11-17T16:00:00Z')).toEqual({ state: 'open', closes: '17:30' });
    expect(describeOpenStatus(at('2026-11-17T16:00:00Z'))).toBe('Open now · until 5:30 pm');
    // 17:30 is closed (end exclusive).
    expect(at('2026-11-17T23:30:00Z').state).toBe('closed');
  });

  it('opens later today / tomorrow', () => {
    expect(describeOpenStatus(at('2026-11-17T13:00:00Z'))).toBe('Opens today at 8 am'); // 07:00 CST
    expect(describeOpenStatus(at('2026-11-18T01:00:00Z'))).toBe('Closed · opens tomorrow at 8 am'); // Tue 19:00 CST
  });

  it('a special closure beats the weekly schedule', () => {
    // Thu 2026-11-26 10:00 CST: closed by special entry; next is Fri.
    const s = at('2026-11-26T16:00:00Z');
    expect(s).toEqual({ state: 'closed', next: { daysAhead: 1, date: '2026-11-27', day: 'Friday', opens: '08:00' } });
  });

  it('weekend rolls to Monday by name', () => {
    expect(describeOpenStatus(at('2026-11-21T19:00:00Z'))).toBe('Closed · opens Monday at 8 am'); // Sat 13:00 CST
  });

  it('unknown, not closed, when there are no hours or the zone is bad', () => {
    expect(isOpenNow({ regularHours: [], specialHours: [] }, new Date(), TZ).state).toBe('unknown');
    expect(isOpenNow(null, new Date(), TZ).state).toBe('unknown');
    expect(isOpenNow(hours, new Date(), 'Not/AZone').state).toBe('unknown');
    expect(describeOpenStatus({ state: 'unknown', reason: 'x' })).toBeNull();
  });

  it('zonedDate uses the business zone', () => {
    expect(zonedDate(TZ, new Date('2026-11-18T03:00:00Z'))).toBe('2026-11-17');
  });
});

import { describe, expect, it } from 'vitest';
import { openingHoursSpecification, specialOpeningHoursSpecification } from '../src/index.js';

const hours = {
  regularHours: [
    { day: 'Monday' as const, intervals: [{ opens: '08:00', closes: '12:00' }, { opens: '13:00', closes: '17:00' }] },
    { day: 'Sunday' as const, intervals: [] },
  ],
  specialHours: [
    { date: '2026-11-01', intervals: [] },
    { date: '2026-11-26', intervals: [] },
    { date: '2026-12-24', intervals: [{ opens: '08:00', closes: '12:00' }] },
  ],
};

describe('openingHoursSpecification', () => {
  it('one entry per interval, closed days omitted', () => {
    expect(openingHoursSpecification(hours)).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Monday', opens: '08:00', closes: '12:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Monday', opens: '13:00', closes: '17:00' },
    ]);
  });

  it('special hours: closures as 00:00–00:00, past dates dropped', () => {
    expect(specialOpeningHoursSpecification(hours, '2026-11-20')).toEqual([
      { '@type': 'OpeningHoursSpecification', validFrom: '2026-11-26', validThrough: '2026-11-26', opens: '00:00', closes: '00:00' },
      { '@type': 'OpeningHoursSpecification', validFrom: '2026-12-24', validThrough: '2026-12-24', opens: '08:00', closes: '12:00' },
    ]);
  });
});

import {
  addDays,
  isCalendarDay,
  warsawDate,
  warsawDayBounds,
  warsawDayStart,
  warsawInstant,
  warsawTime,
} from './calendar-day';

describe('isCalendarDay', () => {
  it.each([
    ['2026-09-30', true],
    ['2028-02-29', true],
    ['2026-02-29', false],
    ['2026-13-01', false],
    ['2026-09-31', false],
    ['2026-9-30', false],
    ['2026-09-30T00:00:00Z', false],
    ['', false],
  ])('%s: %s', (text, valid) => {
    expect(isCalendarDay(text)).toBe(valid);
  });
});

describe('warsawDate', () => {
  it.each([
    // Winter, UTC+1: 23:30 UTC is already the next day in Warsaw.
    ['2026-01-14T23:30:00Z', '2026-01-15'],
    ['2026-01-14T22:59:00Z', '2026-01-14'],
    // Summer, UTC+2.
    ['2026-07-31T22:00:00Z', '2026-08-01'],
    ['2026-07-31T21:59:00Z', '2026-07-31'],
  ])('%s is %s in Warsaw', (instant, day) => {
    expect(warsawDate(new Date(instant))).toBe(day);
  });
});

describe('warsawDayStart', () => {
  it.each([
    ['2026-01-15', '2026-01-14T23:00:00.000Z'],
    ['2026-09-30', '2026-09-29T22:00:00.000Z'],
    // The days the clocks change: midnight is still before the switch.
    ['2026-03-29', '2026-03-28T23:00:00.000Z'],
    ['2026-03-30', '2026-03-29T22:00:00.000Z'],
    ['2026-10-25', '2026-10-24T22:00:00.000Z'],
    ['2026-10-26', '2026-10-25T23:00:00.000Z'],
  ])('%s starts at %s', (day, instant) => {
    expect(warsawDayStart(day).toISOString()).toBe(instant);
  });
});

describe('warsawDayBounds', () => {
  const HOUR_MS = 60 * 60 * 1000;
  const iso = (bounds: { startsAt: Date; endsAt: Date }) => ({
    startsAt: bounds.startsAt.toISOString(),
    endsAt: bounds.endsAt.toISOString(),
  });

  it.each([
    // Winter, UTC+1.
    ['2026-01-15', '2026-01-14T23:00:00.000Z', '2026-01-15T23:00:00.000Z'],
    // Summer, UTC+2.
    ['2026-09-30', '2026-09-29T22:00:00.000Z', '2026-09-30T22:00:00.000Z'],
  ])('%s runs from %s to %s', (day, startsAt, endsAt) => {
    expect(iso(warsawDayBounds(day))).toEqual({ startsAt, endsAt });
  });

  it.each([
    // The clocks go forward at 2:00.
    ['2026-03-29', 23],
    // The clocks go back at 3:00.
    ['2026-10-25', 25],
    ['2026-10-24', 24],
    ['2026-10-26', 24],
  ])('%s lasts %i hours', (day, hours) => {
    const { startsAt, endsAt } = warsawDayBounds(day);
    expect(endsAt.getTime() - startsAt.getTime()).toBe(hours * HOUR_MS);
  });

  it('gives a Nieobecność from 24 to 26 October 2026 its bounds in UTC', () => {
    expect({
      startsAt: warsawDayBounds('2026-10-24').startsAt.toISOString(),
      endsAt: warsawDayBounds('2026-10-26').endsAt.toISOString(),
    }).toEqual({
      // Still summer time, UTC+2.
      startsAt: '2026-10-23T22:00:00.000Z',
      // Winter time since the 25th, UTC+1.
      endsAt: '2026-10-26T23:00:00.000Z',
    });
  });
});

describe('addDays', () => {
  it.each([
    ['2026-10-05', 1, '2026-10-06'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    // The clocks go back on 25 October: still one day.
    ['2026-10-25', 1, '2026-10-26'],
    ['2026-10-01', 30, '2026-10-31'],
    ['2026-10-01', -1, '2026-09-30'],
  ])('%s + %d = %s', (day, days, expected) => {
    expect(addDays(day, days)).toBe(expected);
  });
});

describe('warsawInstant', () => {
  it.each([
    // Winter, UTC+1.
    ['2026-01-15', '10:00', '2026-01-15T09:00:00.000Z'],
    ['2026-01-15', '00:05', '2026-01-14T23:05:00.000Z'],
    // Summer, UTC+2.
    ['2026-07-01', '23:55', '2026-07-01T21:55:00.000Z'],
    // The clocks go forward at 2:00 on the last Sunday of March...
    ['2026-03-29', '01:30', '2026-03-29T00:30:00.000Z'],
    ['2026-03-29', '10:00', '2026-03-29T08:00:00.000Z'],
    // ...and back at 3:00 on the last Sunday of October.
    ['2026-10-25', '01:00', '2026-10-24T23:00:00.000Z'],
    ['2026-10-25', '10:00', '2026-10-25T09:00:00.000Z'],
  ])('%s %s is %s', (day, clock, iso) => {
    expect(warsawInstant(day, clock).toISOString()).toBe(iso);
  });
});

describe('warsawTime', () => {
  it.each([
    ['2026-01-15T09:00:00Z', '10:00'],
    ['2026-01-14T23:05:00Z', '00:05'],
    ['2026-07-01T21:55:00Z', '23:55'],
    ['2026-10-25T09:00:00Z', '10:00'],
  ])('%s is %s in Warsaw', (iso, clock) => {
    expect(warsawTime(iso)).toBe(clock);
  });
});

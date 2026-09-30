import { isCalendarDay, warsawDate } from './calendar-day';

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

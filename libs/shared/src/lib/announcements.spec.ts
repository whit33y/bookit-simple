import { isAnnouncementVisible, warsawDate } from './announcements';

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

describe('isAnnouncementVisible', () => {
  const today = '2026-09-29';

  it.each([
    ['starts today, no end', { showFrom: today, showUntil: null }, true],
    ['ends today', { showFrom: '2026-09-01', showUntil: today }, true],
    [
      'between the days',
      { showFrom: '2026-09-01', showUntil: '2026-10-31' },
      true,
    ],
    ['starts tomorrow', { showFrom: '2026-09-30', showUntil: null }, false],
    [
      'ended yesterday',
      { showFrom: '2026-09-01', showUntil: '2026-09-28' },
      false,
    ],
  ])('%s: %s', (_, announcement, visible) => {
    expect(isAnnouncementVisible(announcement, today)).toBe(visible);
  });
});

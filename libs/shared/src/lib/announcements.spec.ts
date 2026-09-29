import { isAnnouncementVisible } from './announcements';

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

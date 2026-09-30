import {
  AnnouncementDays,
  announcementGroup,
  endsOnOrAfterStart,
  isAnnouncementVisible,
} from './announcements';

// 23:30 and 00:30 around midnight in Warsaw, in summer (UTC+2) and winter (UTC+1).
const SUMMER_2330 = new Date('2026-09-30T21:30:00Z');
const SUMMER_0030 = new Date('2026-09-30T22:30:00Z');
const WINTER_2330 = new Date('2026-01-15T22:30:00Z');
const WINTER_0030 = new Date('2026-01-15T23:30:00Z');

describe('isAnnouncementVisible', () => {
  const noon = new Date('2026-09-29T10:00:00Z');

  it.each<[string, AnnouncementDays, boolean]>([
    ['starts today, no end', { showFrom: '2026-09-29', showUntil: null }, true],
    [
      'started long ago, no end',
      { showFrom: '2025-01-01', showUntil: null },
      true,
    ],
    ['ends today', { showFrom: '2026-09-01', showUntil: '2026-09-29' }, true],
    ['only today', { showFrom: '2026-09-29', showUntil: '2026-09-29' }, true],
    [
      'between the days',
      { showFrom: '2026-09-01', showUntil: '2026-10-31' },
      true,
    ],
    ['starts tomorrow', { showFrom: '2026-09-30', showUntil: null }, false],
    [
      'starts tomorrow, with an end',
      { showFrom: '2026-09-30', showUntil: '2026-10-31' },
      false,
    ],
    [
      'ended yesterday',
      { showFrom: '2026-09-01', showUntil: '2026-09-28' },
      false,
    ],
  ])('%s', (_, announcement, visible) => {
    expect(isAnnouncementVisible(announcement, noon)).toBe(visible);
  });

  describe('counts "today" in Europe/Warsaw', () => {
    it.each([
      ['summer', SUMMER_2330, SUMMER_0030, '2026-09-30'],
      ['winter', WINTER_2330, WINTER_0030, '2026-01-15'],
    ])(
      '%s: one ending today is shown at 23:30 and gone at 00:30',
      (_, lateEvening, afterMidnight, today) => {
        const endsToday = { showFrom: '2026-01-01', showUntil: today };

        expect(isAnnouncementVisible(endsToday, lateEvening)).toBe(true);
        expect(isAnnouncementVisible(endsToday, afterMidnight)).toBe(false);
      },
    );

    it.each([
      ['summer', SUMMER_2330, SUMMER_0030, '2026-10-01'],
      ['winter', WINTER_2330, WINTER_0030, '2026-01-16'],
    ])(
      '%s: one starting tomorrow is hidden at 23:30 and shown at 00:30, while UTC is still on the day before',
      (_, lateEvening, afterMidnight, tomorrow) => {
        const startsTomorrow = { showFrom: tomorrow, showUntil: null };

        expect(isAnnouncementVisible(startsTomorrow, lateEvening)).toBe(false);
        expect(isAnnouncementVisible(startsTomorrow, afterMidnight)).toBe(true);
      },
    );

    it('one with showUntil today is shown until 23:59 Polish time', () => {
      const endsToday = { showFrom: '2026-09-01', showUntil: '2026-09-30' };

      expect(
        isAnnouncementVisible(endsToday, new Date('2026-09-30T21:59:59.999Z')),
      ).toBe(true);
      expect(
        isAnnouncementVisible(endsToday, new Date('2026-09-30T22:00:00Z')),
      ).toBe(false);
    });

    it.each([
      // The clocks go forward on 29 March 2026 and back on 25 October 2026.
      [
        '29 March',
        '2026-03-29',
        '2026-03-29T21:59:00Z',
        '2026-03-29T22:00:00Z',
      ],
      [
        '25 October',
        '2026-10-25',
        '2026-10-25T22:59:00Z',
        '2026-10-25T23:00:00Z',
      ],
    ])(
      'on %s, when the clocks change, the day still ends at midnight in Warsaw',
      (_, day, before, after) => {
        const endsThatDay = { showFrom: '2026-01-01', showUntil: day };

        expect(isAnnouncementVisible(endsThatDay, new Date(before))).toBe(true);
        expect(isAnnouncementVisible(endsThatDay, new Date(after))).toBe(false);
      },
    );

    it('one without showUntil stays shown on every later day', () => {
      const noEnd = { showFrom: '2026-01-15', showUntil: null };

      expect(isAnnouncementVisible(noEnd, WINTER_2330)).toBe(true);
      expect(isAnnouncementVisible(noEnd, SUMMER_0030)).toBe(true);
      expect(
        isAnnouncementVisible(noEnd, new Date('2036-12-31T12:00:00Z')),
      ).toBe(true);
    });
  });
});

describe('announcementGroup', () => {
  it.each<[AnnouncementDays, string]>([
    [{ showFrom: '2026-09-01', showUntil: '2026-09-30' }, 'ACTIVE'],
    [{ showFrom: '2026-09-30', showUntil: null }, 'ACTIVE'],
    [{ showFrom: '2026-10-01', showUntil: null }, 'SCHEDULED'],
    [{ showFrom: '2026-10-01', showUntil: '2026-10-31' }, 'SCHEDULED'],
    [{ showFrom: '2026-09-01', showUntil: '2026-09-29' }, 'PAST'],
  ])('%o at 23:30 on 30 September is %s', (announcement, group) => {
    expect(announcementGroup(announcement, SUMMER_2330)).toBe(group);
  });

  it('moves one ending today to the past at midnight in Warsaw', () => {
    const endsToday = { showFrom: '2026-09-01', showUntil: '2026-09-30' };

    expect(announcementGroup(endsToday, SUMMER_2330)).toBe('ACTIVE');
    expect(announcementGroup(endsToday, SUMMER_0030)).toBe('PAST');
  });
});

describe('endsOnOrAfterStart', () => {
  it.each<[AnnouncementDays, boolean]>([
    [{ showFrom: '2026-09-30', showUntil: null }, true],
    [{ showFrom: '2026-09-30', showUntil: '2026-09-30' }, true],
    [{ showFrom: '2026-09-30', showUntil: '2027-01-01' }, true],
    [{ showFrom: '2026-09-30', showUntil: '2026-09-29' }, false],
  ])('%o: %s', (announcement, valid) => {
    expect(endsOnOrAfterStart(announcement)).toBe(valid);
  });
});

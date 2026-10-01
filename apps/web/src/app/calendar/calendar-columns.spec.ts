import { CalendarStaffMember } from '@bookit/shared';
import {
  nextQuarter,
  personColumns,
  pickPerson,
  swipeStep,
  weekColumns,
  weekDays,
  weekStart,
  weekTitle,
} from './calendar-columns';

const STAFF: CalendarStaffMember[] = [
  { id: 'magda', displayName: 'Magda', visibleUntil: null },
  { id: 'kasia', displayName: 'Kasia', visibleUntil: null },
  { id: 'ewa', displayName: 'Ewa', visibleUntil: '2026-11-11' },
];

describe('weekStart', () => {
  it.each([
    ['2026-11-09', '2026-11-09'],
    ['2026-11-11', '2026-11-09'],
    ['2026-11-15', '2026-11-09'],
    ['2027-01-01', '2026-12-28'],
  ])('the week of %s starts on %s', (day, monday) => {
    expect(weekStart(day)).toBe(monday);
  });
});

describe('weekDays', () => {
  it('is Monday to Sunday', () => {
    expect(weekDays('2026-10-26')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });
});

describe('weekTitle', () => {
  it('names the month once when the week is in one', () => {
    expect(weekTitle('2026-11-09')).toBe('9–15 listopada 2026');
  });

  it('names both months and years when it is not', () => {
    // Intl puts thin spaces around the dash.
    expect(weekTitle('2026-12-28')).toMatch(
      /^28 grudnia 2026\s–\s3 stycznia 2027$/,
    );
  });
});

describe('personColumns', () => {
  it('has a column for every person of the day, an Usunięta osoba marked', () => {
    expect(personColumns(STAFF, '2026-11-11')).toEqual([
      {
        key: 'magda',
        day: '2026-11-11',
        staffMemberId: 'magda',
        label: 'Magda',
        name: 'Magda',
        deleted: false,
      },
      {
        key: 'kasia',
        day: '2026-11-11',
        staffMemberId: 'kasia',
        label: 'Kasia',
        name: 'Kasia',
        deleted: false,
      },
      {
        key: 'ewa',
        day: '2026-11-11',
        staffMemberId: 'ewa',
        label: 'Ewa (usunięta)',
        name: 'Ewa',
        deleted: true,
      },
    ]);
    expect(personColumns(STAFF, '2026-11-12').map((c) => c.key)).toEqual([
      'magda',
      'kasia',
    ]);
  });
});

describe('weekColumns', () => {
  it('has the seven days of one person, with their Święta', () => {
    const columns = weekColumns(STAFF[1], '2026-11-09', [
      { date: '2026-11-11', name: 'Święto Niepodległości' },
    ]);

    expect(columns).toHaveLength(7);
    expect(columns[0]).toEqual({
      key: '2026-11-09',
      day: '2026-11-09',
      staffMemberId: 'kasia',
      label: 'pon., 9.11',
      name: 'poniedziałek, 9 listopada',
      deleted: false,
    });
    expect(columns[2]).toMatchObject({
      label: 'śr., 11.11',
      holiday: 'Święto Niepodległości',
    });
    expect(columns[6].label).toBe('niedz., 15.11');
  });
});

describe('pickPerson', () => {
  it('takes the first one wanted who is in the calendar', () => {
    expect(pickPerson(STAFF, 'gone', 'kasia')?.id).toBe('kasia');
  });

  it('takes the first person without one', () => {
    expect(pickPerson(STAFF, null, undefined)?.id).toBe('magda');
    expect(pickPerson([], 'kasia')).toBeUndefined();
  });
});

describe('nextQuarter', () => {
  // 9:07 in Warsaw.
  const now = new Date('2026-11-11T08:07:00Z');

  it('is the next full quarter of today', () => {
    expect(nextQuarter(now, '2026-11-11')).toEqual(
      new Date('2026-11-11T08:15:00Z'),
    );
    expect(
      nextQuarter(new Date('2026-11-11T08:15:00Z'), '2026-11-11'),
    ).toEqual(new Date('2026-11-11T08:15:00Z'));
  });

  it('goes past midnight late in the evening of today', () => {
    // 23:50 in Warsaw.
    expect(
      nextQuarter(new Date('2026-11-11T22:50:00Z'), '2026-11-11'),
    ).toEqual(new Date('2026-11-11T23:00:00Z'));
  });

  it('is the same clock time on another day', () => {
    // 9:15 on the day after the clocks went back is still 08:15Z in winter.
    expect(nextQuarter(now, '2026-11-20')).toEqual(
      new Date('2026-11-20T08:15:00Z'),
    );
    expect(nextQuarter(now, '2026-10-20')).toEqual(
      new Date('2026-10-20T07:15:00Z'),
    );
  });
});

describe('swipeStep', () => {
  it.each([
    [-80, 10, 1],
    [80, -10, -1],
    [-30, 0, 0],
    [-80, 60, 0],
    [0, 200, 0],
  ])('%i px across and %i down is %i', (dx, dy, step) => {
    expect(swipeStep(dx, dy)).toBe(step);
  });
});

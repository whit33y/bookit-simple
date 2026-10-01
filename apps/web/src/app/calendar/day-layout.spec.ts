import {
  AbsenceView,
  CalendarStaffMember,
  CalendarVisit,
  OpeningHoursDay,
} from '@bookit/shared';
import {
  closedBlocks,
  dayColumns,
  dayRange,
  layoutDay,
  nowRow,
  slots,
  slotStartsAt,
} from './day-layout';

const visit = (
  id: string,
  startsAt: string,
  durationMin: number,
  fields: Partial<CalendarVisit> = {},
): CalendarVisit => ({
  id,
  staffMemberId: 'kasia',
  clientId: 'c1',
  startsAt,
  durationMin,
  breakMin: 0,
  description: null,
  state: 'SCHEDULED',
  services: [],
  createdById: 'kasia',
  updatedById: 'kasia',
  client: { name: 'Anna', phoneE164: null },
  ...fields,
});

const absence = (
  id: string,
  startsAt: string,
  endsAt: string,
  fields: Partial<AbsenceView> = {},
): AbsenceView => ({
  id,
  staffMemberId: 'kasia',
  startsAt,
  endsAt,
  reason: null,
  ...fields,
});

// 2026-10-05 is a Monday in summer time: 9:00 in Warsaw is 07:00Z.
const DAY = '2026-10-05';
const DEFAULT_RANGE = { day: DAY, startMin: 7 * 60, endMin: 21 * 60 };

describe('dayRange', () => {
  it('runs from 7:00 to 21:00 by default', () => {
    expect(dayRange(DAY, [], [])).toEqual(DEFAULT_RANGE);
  });

  it('grows to whole quarters around a Wizyta, with its Przerwa, out of it', () => {
    const early = visit('v1', '2026-10-05T04:10:00Z', 30); // 6:10
    const late = visit('v2', '2026-10-05T18:30:00Z', 40, { breakMin: 10 }); // 20:30–21:20

    expect(dayRange(DAY, [early, late], [])).toEqual({
      day: DAY,
      startMin: 6 * 60,
      endMin: 21 * 60 + 30,
    });
  });

  it('starts at midnight for a Wizyta from the day before that goes past it', () => {
    const night = visit('v1', '2026-10-04T21:30:00Z', 90); // 23:30–1:00

    expect(dayRange(DAY, [night], []).startMin).toBe(0);
  });

  it('grows to a Nieobecność edge inside the day, but not to whole days off', () => {
    const morning = absence(
      'a1',
      '2026-10-05T03:00:00Z',
      '2026-10-05T06:00:00Z',
    ); // 5:00–8:00
    const holiday = absence(
      'a2',
      '2026-10-04T22:00:00Z',
      '2026-10-07T22:00:00Z',
    );

    expect(dayRange(DAY, [], [morning, holiday])).toEqual({
      ...DEFAULT_RANGE,
      startMin: 5 * 60,
    });
  });

  it('ignores the Wizyty and Nieobecności of other days', () => {
    const tomorrow = visit('v1', '2026-10-06T03:00:00Z', 60);
    const yesterday = absence(
      'a1',
      '2026-10-04T02:00:00Z',
      '2026-10-04T05:00:00Z',
    );

    expect(dayRange(DAY, [tomorrow], [yesterday])).toEqual(DEFAULT_RANGE);
  });

  it('counts real minutes from midnight on the days the clocks change', () => {
    // 29 March: 2:00 → 3:00, so 7:00 is 6 h after midnight.
    expect(dayRange('2026-03-29', [], [])).toEqual({
      day: '2026-03-29',
      startMin: 6 * 60,
      endMin: 20 * 60,
    });
    // 25 October: 3:00 → 2:00, so 7:00 is 8 h after midnight.
    expect(dayRange('2026-10-25', [], [])).toEqual({
      day: '2026-10-25',
      startMin: 8 * 60,
      endMin: 22 * 60,
    });
  });
});

describe('layoutDay', () => {
  it('puts a Wizyta in the minute rows of the grid, with its Przerwa under it', () => {
    const nine = visit('v1', '2026-10-05T07:00:00Z', 60, { breakMin: 10 });

    expect(layoutDay([nine], [], DEFAULT_RANGE).visits).toEqual([
      { visit: nine, row: 121, rows: 60, breakRows: 10, lane: 0, lanes: 1 },
    ]);
  });

  it('draws two Wizyty of one person that overlap side by side', () => {
    const first = visit('v1', '2026-10-05T07:00:00Z', 60); // 9:00–10:00
    const second = visit('v2', '2026-10-05T07:30:00Z', 60); // 9:30–10:30
    const later = visit('v3', '2026-10-05T09:00:00Z', 30); // 11:00, alone again

    const blocks = layoutDay([second, later, first], [], DEFAULT_RANGE).visits;

    const lanes = Object.fromEntries(
      blocks.map((b) => [b.visit.id, [b.lane, b.lanes]]),
    );
    expect(lanes).toEqual({ v1: [0, 2], v2: [1, 2], v3: [0, 1] });
  });

  it('keeps every Wizyta of a chain of overlaps in one group', () => {
    const a = visit('a', '2026-10-05T07:00:00Z', 60); // 9:00–10:00
    const b = visit('b', '2026-10-05T07:45:00Z', 60); // 9:45–10:45
    const c = visit('c', '2026-10-05T08:30:00Z', 60); // 10:30–11:30, frees lane 0

    const lanes = Object.fromEntries(
      layoutDay([a, b, c], [], DEFAULT_RANGE).visits.map((v) => [
        v.visit.id,
        [v.lane, v.lanes],
      ]),
    );
    expect(lanes).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2] });
  });

  it('counts the Przerwa as an overlap, but not a Wizyta that starts at the end of another', () => {
    const withBreak = visit('v1', '2026-10-05T07:00:00Z', 30, { breakMin: 15 }); // until 9:45
    const inBreak = visit('v2', '2026-10-05T07:30:00Z', 15); // 9:30
    const after = visit('v3', '2026-10-05T07:45:00Z', 15); // 9:45, right after

    const lanes = layoutDay(
      [withBreak, inBreak, after],
      [],
      DEFAULT_RANGE,
    ).visits.map((b) => [b.visit.id, b.lane, b.lanes]);

    expect(lanes).toEqual([
      ['v1', 0, 2],
      ['v2', 1, 2],
      ['v3', 0, 1],
    ]);
  });

  it('does not split the width between different people', () => {
    const kasia = visit('v1', '2026-10-05T07:00:00Z', 60);
    const ola = visit('v2', '2026-10-05T07:00:00Z', 60, {
      staffMemberId: 'ola',
    });

    const blocks = layoutDay([kasia, ola], [], DEFAULT_RANGE).visits;

    expect(blocks.map((b) => b.lanes)).toEqual([1, 1]);
  });

  it('keeps the real length of a Wizyta over the change of the clocks', () => {
    // 29 March at 1:30 for 2 h: ends at 4:30 on the clock, but is 120 rows tall.
    const night = visit('v1', '2026-03-29T00:30:00Z', 120);
    const range = dayRange('2026-03-29', [night], []);

    expect(range.startMin).toBe(90);
    expect(layoutDay([night], [], range).visits[0]).toMatchObject({
      row: 1,
      rows: 120,
    });
    expect(slots(range).map((s) => s.label)).toContain('3:00');
    expect(slots(range).map((s) => s.label)).not.toContain('2:00');
  });

  it('keeps the real length of a Wizyta over the hour the clocks go back', () => {
    // 25 October at 2:30 summer time for 90 min: ends at 3:00 winter time.
    const night = visit('v1', '2026-10-25T00:30:00Z', 90);
    const range = dayRange('2026-10-25', [night], []);

    expect(range.startMin).toBe(150);
    expect(layoutDay([night], [], range).visits[0]).toMatchObject({
      row: 1,
      rows: 90,
    });
    expect(
      slots(range)
        .slice(0, 5)
        .map((s) => s.label),
    ).toEqual(['2:30', '2:45', '2:00', '2:15', '2:30']);
  });

  it('cuts a Wizyta from the day before at midnight', () => {
    const night = visit('v1', '2026-10-04T21:30:00Z', 90, { breakMin: 15 }); // 23:30–1:00, Przerwa to 1:15
    const range = dayRange(DAY, [night], []);

    expect(layoutDay([night], [], range).visits[0]).toMatchObject({
      row: 1,
      rows: 60,
      breakRows: 15,
    });
  });

  it('cuts a Nieobecność to the range of the grid', () => {
    const allDay = absence(
      'a1',
      '2026-10-04T22:00:00Z',
      '2026-10-05T22:00:00Z',
    );
    const lunch = absence('a2', '2026-10-05T11:00:00Z', '2026-10-05T12:00:00Z'); // 13:00–14:00

    expect(layoutDay([], [allDay, lunch], DEFAULT_RANGE).absences).toEqual([
      { absence: allDay, row: 1, rows: 14 * 60 },
      { absence: lunch, row: 6 * 60 + 1, rows: 60 },
    ]);
  });

  it('leaves out what is outside the range', () => {
    const tomorrow = visit('v1', '2026-10-06T07:00:00Z', 60);
    const yesterday = absence(
      'a1',
      '2026-10-04T07:00:00Z',
      '2026-10-04T09:00:00Z',
    );

    expect(layoutDay([tomorrow], [yesterday], DEFAULT_RANGE)).toEqual({
      visits: [],
      absences: [],
    });
  });
});

describe('slots', () => {
  it('lists the quarters of the range with their clock time', () => {
    const list = slots(DEFAULT_RANGE);

    expect(list).toHaveLength(14 * 4);
    expect(list.slice(0, 5)).toEqual([
      { row: 1, label: '7:00', hour: true },
      { row: 16, label: '7:15', hour: false },
      { row: 31, label: '7:30', hour: false },
      { row: 46, label: '7:45', hour: false },
      { row: 61, label: '8:00', hour: true },
    ]);
  });
});

describe('slotStartsAt', () => {
  it('gives the instant a row starts at', () => {
    expect(slotStartsAt(DEFAULT_RANGE, 121).toISOString()).toBe(
      '2026-10-05T07:00:00.000Z',
    );
  });
});

describe('closedBlocks', () => {
  const week: OpeningHoursDay[] = [
    { weekday: 1, opensAt: '09:00', closesAt: '19:00' },
    { weekday: 6, opensAt: '09:00', closesAt: '15:00' },
  ];

  it('greys the hours before opening and after closing', () => {
    // 14 November 2026 is a Saturday.
    const range = { day: '2026-11-14', startMin: 7 * 60, endMin: 21 * 60 };

    expect(closedBlocks(range, week)).toEqual([
      { row: 1, rows: 2 * 60 },
      { row: 8 * 60 + 1, rows: 6 * 60 },
    ]);
  });

  it('greys a whole closed day', () => {
    const sunday = { day: '2026-10-04', startMin: 7 * 60, endMin: 21 * 60 };

    expect(closedBlocks(sunday, week)).toEqual([{ row: 1, rows: 14 * 60 }]);
  });

  it('greys nothing when the Salon is open over the whole range', () => {
    const range = { day: DAY, startMin: 10 * 60, endMin: 18 * 60 };

    expect(closedBlocks(range, week)).toEqual([]);
  });
});

describe('nowRow', () => {
  it('gives the row of the current minute on the day', () => {
    expect(nowRow(DEFAULT_RANGE, new Date('2026-10-05T07:20:00Z'))).toBe(141);
  });

  it('is null on another day or outside the range', () => {
    expect(nowRow(DEFAULT_RANGE, new Date('2026-10-06T07:20:00Z'))).toBeNull();
    expect(nowRow(DEFAULT_RANGE, new Date('2026-10-05T03:00:00Z'))).toBeNull();
  });
});

describe('dayColumns', () => {
  const person = (
    id: string,
    visibleUntil: string | null = null,
  ): CalendarStaffMember => ({ id, displayName: id, visibleUntil });

  it('shows an Usunięta osoba z Personelu until the day of her last Wizyta', () => {
    const staff = [person('kasia'), person('magda', '2026-10-05')];

    expect(dayColumns(staff, '2026-10-05').map((p) => p.id)).toEqual([
      'kasia',
      'magda',
    ]);
    expect(dayColumns(staff, '2026-10-06').map((p) => p.id)).toEqual(['kasia']);
  });
});

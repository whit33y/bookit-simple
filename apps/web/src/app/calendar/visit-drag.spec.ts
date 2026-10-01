import { CalendarResponse, CalendarVisit } from '@bookit/shared';
import { dayRange } from './day-layout';
import {
  DragColumn,
  movedVisit,
  moveRequest,
  replaceVisit,
  resizedVisit,
  snapMinutes,
} from './visit-drag';

const visit = (fields: Partial<CalendarVisit> = {}): CalendarVisit => ({
  id: 'v1',
  staffMemberId: 'kasia',
  clientId: 'c1',
  // 10:00 in Warsaw.
  startsAt: '2026-11-11T09:00:00.000Z',
  durationMin: 45,
  breakMin: 10,
  description: null,
  state: 'SCHEDULED',
  services: [],
  createdById: 'kasia',
  updatedById: 'kasia',
  client: { name: 'Anna Nowak', phoneE164: null },
  ...fields,
});

const DAY = '2026-11-11';
// 7:00–21:00.
const RANGE = dayRange(DAY, [], []);
const COLUMNS: DragColumn[] = [
  { id: 'kasia', deleted: false },
  { id: 'ola', deleted: false },
  { id: 'ewa', deleted: true },
];

describe('snapMinutes', () => {
  // A minute is 1.6 px, so a quarter is 24 px.
  it.each([
    [0, 0],
    [11, 0],
    [13, 15],
    [24, 15],
    [96, 60],
    [-13, -15],
    [-40, -30],
  ])('%i px is %i min', (px, minutes) => {
    expect(snapMinutes(px, 1.6)).toBe(minutes);
  });
});

describe('movedVisit', () => {
  it('moves a Wizyta in time and to another column', () => {
    expect(
      movedVisit(visit(), { minutes: 60, columns: 1 }, COLUMNS, RANGE),
    ).toMatchObject({
      staffMemberId: 'ola',
      startsAt: '2026-11-11T10:00:00.000Z',
      durationMin: 45,
    });
  });

  it('keeps the person when moved over an Usunięta osoba or past the last column', () => {
    expect(
      movedVisit(visit(), { minutes: 0, columns: 2 }, COLUMNS, RANGE)
        .staffMemberId,
    ).toBe('kasia');
    expect(
      movedVisit(
        visit({ staffMemberId: 'ola' }),
        { minutes: 0, columns: 5 },
        COLUMNS,
        RANGE,
      ).staffMemberId,
    ).toBe('ola');
    expect(
      movedVisit(visit(), { minutes: 0, columns: -3 }, COLUMNS, RANGE)
        .staffMemberId,
    ).toBe('kasia');
  });

  it('stays inside the hours of the grid', () => {
    expect(
      movedVisit(visit(), { minutes: -600, columns: 0 }, COLUMNS, RANGE)
        .startsAt,
    ).toBe('2026-11-11T06:00:00.000Z');
    // 21:00 less the 45 min and the 10 min Przerwa.
    expect(
      movedVisit(visit(), { minutes: 900, columns: 0 }, COLUMNS, RANGE)
        .startsAt,
    ).toBe('2026-11-11T19:05:00.000Z');
  });

  it('counts real minutes on the day the clocks go back', () => {
    // 25 October 2026: 2:00 happens twice, 7:00 is 8 hours after midnight.
    const range = dayRange('2026-10-25', [], []);
    expect(
      movedVisit(
        visit({ startsAt: '2026-10-25T06:00:00.000Z' }),
        { minutes: 60, columns: 0 },
        COLUMNS,
        range,
      ).startsAt,
    ).toBe('2026-10-25T07:00:00.000Z');
  });
});

describe('resizedVisit', () => {
  it.each([
    [15, 60],
    [-15, 30],
    [-30, 15],
    [-90, 15],
    [900, 600],
  ])('%i min more on 45 min is %i min', (minutes, durationMin) => {
    expect(resizedVisit(visit(), minutes).durationMin).toBe(durationMin);
  });

  it('keeps a Czas trwania that is not a full quarter in steps of 15', () => {
    expect(resizedVisit(visit({ durationMin: 40 }), 15).durationMin).toBe(55);
  });
});

describe('moveRequest', () => {
  it('sends only what changed', () => {
    const before = visit();
    expect(moveRequest(before, { ...before, durationMin: 60 })).toEqual({
      durationMin: 60,
    });
    expect(
      moveRequest(before, {
        ...before,
        staffMemberId: 'ola',
        startsAt: '2026-11-11T10:00:00.000Z',
      }),
    ).toEqual({ staffMemberId: 'ola', startsAt: '2026-11-11T10:00:00.000Z' });
  });

  it('is empty for a Wizyta put back where it was', () => {
    const before = visit();
    expect(
      moveRequest(before, { ...before, startsAt: '2026-11-11T10:00:00+01:00' }),
    ).toEqual({});
  });

  it('adds acceptCollisions when asked', () => {
    const before = visit();
    expect(moveRequest(before, { ...before, durationMin: 60 }, true)).toEqual({
      durationMin: 60,
      acceptCollisions: true,
    });
  });
});

describe('replaceVisit', () => {
  it('puts the Wizyta in place of the one with its id', () => {
    const other = visit({ id: 'v2' });
    const calendar = { visits: [visit(), other] } as CalendarResponse;
    const moved = visit({ durationMin: 90 });

    const result = replaceVisit(calendar, moved);

    expect(result.visits).toEqual([moved, other]);
    expect(calendar.visits[0].durationMin).toBe(45);
  });
});

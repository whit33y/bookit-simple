import {
  AbsenceView,
  addDays,
  CalendarDay,
  CalendarStaffMember,
  CalendarVisit,
  OpeningHoursDay,
  warsawDayStart,
} from '@bookit/shared';

/** The grid has a line every 15 minutes. */
export const SLOT_MIN = 15;
const DEFAULT_STARTS_AT = '07:00';
const DEFAULT_ENDS_AT = '21:00';

export const MINUTE_MS = 60 * 1000;

/**
 * The part of `day` the grid shows, in real minutes since its Warsaw midnight: on the
 * days the clocks change 7:00 is 6 or 8 hours after midnight, so every Wizyta keeps its
 * real length and the clock times come from `slots`. The grid has one row per minute.
 */
export interface DayRange {
  day: CalendarDay;
  startMin: number;
  endMin: number;
}

/** Rows of the grid, CSS style: from line `row` (from 1), `rows` tall. */
export interface RowSpan {
  row: number;
  rows: number;
}

/**
 * A Wizyta in its column. The Przerwa takes `breakRows` under it. Wizyty of one person
 * that overlap (Kolizje) share the width: this one is lane `lane` of `lanes`.
 */
export interface VisitBlock extends RowSpan {
  visit: CalendarVisit;
  breakRows: number;
  lane: number;
  lanes: number;
}

export interface AbsenceBlock extends RowSpan {
  absence: AbsenceView;
}

export interface DayLayout {
  visits: VisitBlock[];
  absences: AbsenceBlock[];
}

export interface Slot {
  row: number;
  /** `H:mm` on the Warsaw clock. */
  label: string;
  /** Whether it starts a full hour. */
  hour: boolean;
}

const WARSAW_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

/** Minutes Warsaw is ahead of UTC at `instant`: 60 in winter, 120 in summer. */
function warsawOffsetMin(instant: Date): number {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(
      WARSAW_PARTS.formatToParts(instant).find((p) => p.type === type)?.value,
    );
  const wall = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
  );
  return Math.round((wall - instant.getTime()) / MINUTE_MS);
}

const minutesOf = (clock: string): number => {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
};

/** Real minutes from the midnight of `day` to the Warsaw clock time `clock` (`HH:mm`). */
function minuteOfClock(day: CalendarDay, clock: string): number {
  const midnight = warsawDayStart(day);
  const naive = minutesOf(clock);
  const shift =
    warsawOffsetMin(new Date(midnight.getTime() + naive * MINUTE_MS)) -
    warsawOffsetMin(midnight);
  return naive - shift;
}

const minuteOf = (day: CalendarDay, instant: string | Date): number =>
  (new Date(instant).getTime() - warsawDayStart(day).getTime()) / MINUTE_MS;

const dayLength = (day: CalendarDay): number =>
  minuteOf(day, warsawDayStart(addDays(day, 1)));

const visitEndMin = (day: CalendarDay, visit: CalendarVisit): number =>
  minuteOf(day, visit.startsAt) + visit.durationMin + visit.breakMin;

const floorToSlot = (minute: number) =>
  Math.floor(minute / SLOT_MIN) * SLOT_MIN;
const ceilToSlot = (minute: number) => Math.ceil(minute / SLOT_MIN) * SLOT_MIN;

/**
 * 7:00–21:00 of `day`, grown to whole quarters so every Wizyta (with its Przerwa) and
 * every Nieobecność fits, up to the bounds of the day. A Nieobecność only grows it by
 * an edge inside the day: whole days off would otherwise always show the night.
 */
export function dayRange(
  day: CalendarDay,
  visits: CalendarVisit[],
  absences: AbsenceView[],
): DayRange {
  const length = dayLength(day);
  let startMin = minuteOfClock(day, DEFAULT_STARTS_AT);
  let endMin = minuteOfClock(day, DEFAULT_ENDS_AT);
  for (const visit of visits) {
    const start = minuteOf(day, visit.startsAt);
    const end = visitEndMin(day, visit);
    if (end <= 0 || start >= length) continue;
    startMin = Math.min(startMin, floorToSlot(Math.max(start, 0)));
    endMin = Math.max(endMin, ceilToSlot(Math.min(end, length)));
  }
  for (const absence of absences) {
    const start = minuteOf(day, absence.startsAt);
    const end = minuteOf(day, absence.endsAt);
    if (end <= 0 || start >= length) continue;
    if (start > 0) startMin = Math.min(startMin, floorToSlot(start));
    if (end < length) endMin = Math.max(endMin, ceilToSlot(end));
  }
  return { day, startMin, endMin };
}

/** The rows from minute `start` to `end` of the day, cut to the range; `null` when none. */
function span(range: DayRange, start: number, end: number): RowSpan | null {
  const from = Math.max(start, range.startMin);
  const to = Math.min(end, range.endMin);
  return to > from ? { row: from - range.startMin + 1, rows: to - from } : null;
}

interface Placed {
  visit: CalendarVisit;
  start: number;
  end: number;
  lane: number;
}

/**
 * Lanes for the Wizyty of one person, sorted by start. A group runs while Wizyty
 * overlap one another, also in a chain; every Wizyta of a group gets the first lane
 * free at its start, and the group's lane count is its width.
 */
function assignLanes(
  sorted: Omit<Placed, 'lane'>[],
): (Placed & { lanes: number })[] {
  const result: (Placed & { lanes: number })[] = [];
  let group: Placed[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const closeGroup = () => {
    for (const placed of group)
      result.push({ ...placed, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    if (item.start >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.push(item.end) - 1;
    else laneEnds[lane] = item.end;
    group.push({ ...item, lane });
    groupEnd = Math.max(groupEnd, item.end);
  }
  closeGroup();
  return result;
}

/**
 * Where the Wizyty and Nieobecności of a day go in the grid of `range`. A Wizyta
 * overlaps another with its Przerwa, like a Kolizja; one ending when another starts
 * does not. What is outside the range is left out, the rest is cut to it.
 */
export function layoutDay(
  visits: CalendarVisit[],
  absences: AbsenceView[],
  range: DayRange,
): DayLayout {
  const byPerson = new Map<string, Omit<Placed, 'lane'>[]>();
  for (const visit of visits) {
    const start = minuteOf(range.day, visit.startsAt);
    const end = visitEndMin(range.day, visit);
    if (!span(range, start, end)) continue;
    const own = byPerson.get(visit.staffMemberId) ?? [];
    own.push({ visit, start, end });
    byPerson.set(visit.staffMemberId, own);
  }
  const visitBlocks: VisitBlock[] = [];
  for (const own of byPerson.values()) {
    own.sort((a, b) => a.start - b.start || b.end - a.end);
    for (const { visit, start, end, lane, lanes } of assignLanes(own)) {
      const workEnd = end - visit.breakMin;
      // A Wizyta only seen by its Przerwa (from the day before) is 0 rows tall.
      const work = span(range, start, workEnd);
      const all = span(range, start, end) as RowSpan;
      visitBlocks.push({
        visit,
        row: all.row,
        rows: work?.rows ?? 0,
        breakRows: all.rows - (work?.rows ?? 0),
        lane,
        lanes,
      });
    }
  }
  const absenceBlocks: AbsenceBlock[] = [];
  for (const absence of absences) {
    const rows = span(
      range,
      minuteOf(range.day, absence.startsAt),
      minuteOf(range.day, absence.endsAt),
    );
    if (rows) absenceBlocks.push({ absence, ...rows });
  }
  return { visits: visitBlocks, absences: absenceBlocks };
}

const WARSAW_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Warsaw',
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `H:mm` of `instant` on the Warsaw clock. */
export const warsawClock = (instant: Date | string): string =>
  WARSAW_CLOCK.format(new Date(instant));

/** The instant row `row` of the grid starts at. */
export function slotStartsAt(range: DayRange, row: number): Date {
  return new Date(
    warsawDayStart(range.day).getTime() +
      (range.startMin + row - 1) * MINUTE_MS,
  );
}

/** The quarters of the range, each with its clock time. */
export function slots(range: DayRange): Slot[] {
  const list: Slot[] = [];
  for (let minute = range.startMin; minute < range.endMin; minute += SLOT_MIN) {
    const row = minute - range.startMin + 1;
    const label = warsawClock(slotStartsAt(range, row));
    list.push({ row, label, hour: label.endsWith(':00') });
  }
  return list;
}

/** ISO weekday of `day`: 1 = Monday ... 7 = Sunday. */
const weekdayOf = (day: CalendarDay): number =>
  new Date(`${day}T00:00:00Z`).getUTCDay() || 7;

/** The rows outside the Godziny otwarcia: all of them on a closed day. */
export function closedBlocks(
  range: DayRange,
  openingHours: OpeningHoursDay[],
): RowSpan[] {
  const open = openingHours.find((d) => d.weekday === weekdayOf(range.day));
  if (!open) return [span(range, range.startMin, range.endMin) as RowSpan];
  return [
    span(range, range.startMin, minuteOfClock(range.day, open.opensAt)),
    span(range, minuteOfClock(range.day, open.closesAt), range.endMin),
  ].filter((block): block is RowSpan => block !== null);
}

/** The row of `now`'s minute, or `null` when it is not in the range. */
export function nowRow(range: DayRange, now: Date): number | null {
  const minute = Math.floor(minuteOf(range.day, now));
  return minute >= range.startMin && minute < range.endMin
    ? minute - range.startMin + 1
    : null;
}

/** The columns of `day`: an Usunięta osoba z Personelu only until her `visibleUntil`. */
export function dayColumns(
  staff: CalendarStaffMember[],
  day: CalendarDay,
): CalendarStaffMember[] {
  return staff.filter(
    ({ visibleUntil }) => visibleUntil === null || day <= visibleUntil,
  );
}

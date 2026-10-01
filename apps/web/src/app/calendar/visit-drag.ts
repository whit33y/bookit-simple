import {
  CalendarResponse,
  CalendarVisit,
  SERVICE_DURATION_MAX,
  UpdateVisitRequest,
  warsawDayStart,
} from '@bookit/shared';
import { DayRange, MINUTE_MS, SLOT_MIN } from './day-layout';

/** The shortest Czas trwania the handle leaves. */
const MIN_DURATION = SLOT_MIN;

/** A column of the grid a Wizyta can be dragged over: one person on one day. */
export interface DragColumn {
  staffMemberId: string;
  /** An Usunięta osoba z Personelu takes no Wizyty. */
  deleted: boolean;
  /** The hours of its day the grid shows, at the same clock times in every column. */
  range: DayRange;
}

/** How far a dragged Wizyta went: in minutes and in columns. */
export interface DragShift {
  minutes: number;
  columns: number;
}

/** A Wizyta before and after it was dragged. */
export interface VisitMove {
  before: CalendarVisit;
  after: CalendarVisit;
}

/** A distance on the grid, in whole quarters: the drag snaps to the lines. */
export const snapMinutes = (px: number, minutePx: number): number =>
  Math.round(px / (minutePx * SLOT_MIN)) * SLOT_MIN || 0;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * `visit`, in column `from`, moved by `shift`: to the same row of the target column,
 * kept inside its hours with the Przerwa. It stays in its column over an Usunięta osoba
 * or past the last column.
 */
export function movedVisit(
  visit: CalendarVisit,
  shift: DragShift,
  from: number,
  columns: DragColumn[],
): CalendarVisit {
  const source = columns[from];
  const candidate = columns[from + shift.columns];
  const target = candidate && !candidate.deleted ? candidate : source;
  const sourceMidnight = warsawDayStart(source.range.day).getTime();
  const row =
    (new Date(visit.startsAt).getTime() - sourceMidnight) / MINUTE_MS -
    source.range.startMin +
    shift.minutes;
  const { day, startMin, endMin } = target.range;
  const latest = endMin - visit.durationMin - visit.breakMin;
  const minute = clamp(startMin + row, startMin, Math.max(latest, startMin));
  return {
    ...visit,
    staffMemberId: target.staffMemberId,
    startsAt: new Date(
      warsawDayStart(day).getTime() + minute * MINUTE_MS,
    ).toISOString(),
  };
}

/** `visit` with its Czas trwania longer by `minutes`, 15 to 600 min. */
export function resizedVisit(
  visit: CalendarVisit,
  minutes: number,
): CalendarVisit {
  return {
    ...visit,
    durationMin: clamp(
      visit.durationMin + minutes,
      MIN_DURATION,
      SERVICE_DURATION_MAX,
    ),
  };
}

/** The `PATCH` body of a drag: only what changed, `{}` when nothing did. */
export function moveRequest(
  before: CalendarVisit,
  after: CalendarVisit,
  acceptCollisions = false,
): UpdateVisitRequest {
  const changes: UpdateVisitRequest = {};
  if (after.staffMemberId !== before.staffMemberId) {
    changes.staffMemberId = after.staffMemberId;
  }
  if (
    new Date(after.startsAt).getTime() !== new Date(before.startsAt).getTime()
  ) {
    changes.startsAt = after.startsAt;
  }
  if (after.durationMin !== before.durationMin) {
    changes.durationMin = after.durationMin;
  }
  if (acceptCollisions) changes.acceptCollisions = true;
  return changes;
}

/** `calendar` with `visit` in place of the Wizyta with its id. */
export function replaceVisit(
  calendar: CalendarResponse,
  visit: CalendarVisit,
): CalendarResponse {
  return {
    ...calendar,
    visits: calendar.visits.map((v) => (v.id === visit.id ? visit : v)),
  };
}

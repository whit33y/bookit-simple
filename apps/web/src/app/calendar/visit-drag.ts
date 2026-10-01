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

/** A column of the grid a Wizyta can be dragged over. */
export interface DragColumn {
  id: string;
  /** An Usunięta osoba z Personelu takes no Wizyty. */
  deleted: boolean;
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
 * `visit` moved by `shift`, kept inside the hours of `range` with its Przerwa. It
 * stays with its person over an Usunięta osoba or past the last column.
 */
export function movedVisit(
  visit: CalendarVisit,
  shift: DragShift,
  columns: DragColumn[],
  range: DayRange,
): CalendarVisit {
  const from = columns.findIndex((c) => c.id === visit.staffMemberId);
  const target = columns[from + shift.columns];
  const midnight = warsawDayStart(range.day).getTime();
  const start =
    (new Date(visit.startsAt).getTime() - midnight) / MINUTE_MS + shift.minutes;
  const latest = range.endMin - visit.durationMin - visit.breakMin;
  const minute = clamp(start, range.startMin, Math.max(latest, range.startMin));
  return {
    ...visit,
    staffMemberId:
      from !== -1 && target && !target.deleted
        ? target.id
        : visit.staffMemberId,
    startsAt: new Date(midnight + minute * MINUTE_MS).toISOString(),
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

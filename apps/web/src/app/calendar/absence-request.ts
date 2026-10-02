import { HttpErrorResponse } from '@angular/common/http';
import {
  ABSENCE_ENDS_BEFORE_START,
  ABSENCE_STAFF_UNAVAILABLE,
  AbsenceView,
  addDays,
  CalendarDay,
  CreateAbsenceRequest,
  UpdateAbsenceRequest,
  warsawDate,
  warsawDayBounds,
  warsawDayStart,
  warsawInstant,
  warsawTime,
} from '@bookit/shared';

/** What the Nieobecność form holds when it is saved. */
export interface AbsenceFields {
  staffMemberId: string;
  /** Whole days from `fromDay` to `toDay`, both included; the times are not used. */
  allDay: boolean;
  fromDay: CalendarDay;
  /** `HH:mm` on the Warsaw clock. */
  fromTime: string;
  toDay: CalendarDay;
  toTime: string;
  reason: string;
}

const DEFAULT_FROM_TIME = '09:00';
const DEFAULT_TO_TIME = '17:00';

/** The fields a `422` of saving can belong under. */
export type AbsenceErrorField = 'toDay' | 'staffMemberId';

/** A new Nieobecność starts as the whole of `day`. */
export function newAbsenceFields(
  day: CalendarDay,
  staffMemberId = '',
): AbsenceFields {
  return {
    staffMemberId,
    allDay: true,
    fromDay: day,
    fromTime: DEFAULT_FROM_TIME,
    toDay: day,
    toTime: DEFAULT_TO_TIME,
    reason: '',
  };
}

/**
 * The `POST /api/absences` body of the form. Whole days run from the midnight of the
 * first to the one after the last (`warsawDayBounds`), so a change of the clocks in
 * between is counted right.
 */
export function absenceRequest(fields: AbsenceFields): CreateAbsenceRequest {
  const startsAt = fields.allDay
    ? warsawDayBounds(fields.fromDay).startsAt
    : warsawInstant(fields.fromDay, fields.fromTime);
  const endsAt = fields.allDay
    ? warsawDayBounds(fields.toDay).endsAt
    : warsawInstant(fields.toDay, fields.toTime);
  return {
    staffMemberId: fields.staffMemberId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    reason: fields.reason.trim() || null,
  };
}

const isMidnight = (instant: Date): boolean =>
  warsawDayStart(warsawDate(instant)).getTime() === instant.getTime();

/** The form of a saved Nieobecność: one from midnight to midnight is on whole days. */
export function absenceFields(absence: AbsenceView): AbsenceFields {
  const startsAt = new Date(absence.startsAt);
  const endsAt = new Date(absence.endsAt);
  const allDay = isMidnight(startsAt) && isMidnight(endsAt);
  return {
    staffMemberId: absence.staffMemberId,
    allDay,
    fromDay: warsawDate(startsAt),
    fromTime: allDay ? DEFAULT_FROM_TIME : warsawTime(startsAt),
    // The midnight it ends at is the start of the day after the last one.
    toDay: allDay ? addDays(warsawDate(endsAt), -1) : warsawDate(endsAt),
    toTime: allDay ? DEFAULT_TO_TIME : warsawTime(endsAt),
    reason: absence.reason ?? '',
  };
}

const sameInstant = (a: string, b: string) =>
  new Date(a).getTime() === new Date(b).getTime();

/** The `PATCH` body: only what differs from the saved Nieobecność. */
export function absenceChanges(
  absence: AbsenceView,
  body: CreateAbsenceRequest,
): UpdateAbsenceRequest {
  const changes: UpdateAbsenceRequest = {};
  if (body.staffMemberId !== absence.staffMemberId) {
    changes.staffMemberId = body.staffMemberId;
  }
  if (!sameInstant(body.startsAt, absence.startsAt)) {
    changes.startsAt = body.startsAt;
  }
  if (!sameInstant(body.endsAt, absence.endsAt)) changes.endsAt = body.endsAt;
  if ((body.reason ?? null) !== absence.reason) {
    changes.reason = body.reason ?? null;
  }
  return changes;
}

/** The field a `422` of saving belongs under, `null` for an error of the whole form. */
export function fieldOfError(error: unknown): AbsenceErrorField | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 422) {
    return null;
  }
  const message = (error.error as { message?: unknown } | null)?.message;
  if (message === ABSENCE_ENDS_BEFORE_START) return 'toDay';
  if (message === ABSENCE_STAFF_UNAVAILABLE) return 'staffMemberId';
  return null;
}

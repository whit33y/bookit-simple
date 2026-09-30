/** One Nieobecność in the replies of `/api/absences`. Dates in ISO 8601. */
export interface AbsenceView {
  id: string;
  staffMemberId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

/**
 * `POST /api/absences` body. Replies `201` with the new `AbsenceView`. The API takes any
 * instants; for whole days the form sends the bounds from `warsawDayBounds`.
 * `422` for a person of another Salon or a deleted one, or `endsAt` not after `startsAt`.
 */
export interface CreateAbsenceRequest {
  staffMemberId: string;
  /** ISO 8601 with an offset. */
  startsAt: string;
  /** ISO 8601 with an offset, after `startsAt`. */
  endsAt: string;
  /** Urlop, L4...; blank or left out = none. */
  reason?: string | null;
}

/**
 * `PATCH /api/absences/:id` body: only the fields to change. Replies with the
 * `AbsenceView`. `DELETE /api/absences/:id` replies `204`.
 */
export type UpdateAbsenceRequest = Partial<CreateAbsenceRequest>;

export const ABSENCE_REASON_MAX_LENGTH = 200;

/** Label of a Nieobecność without a reason in the Kolizje. */
export const ABSENCE_DEFAULT_LABEL = 'Nieobecność';

export const ABSENCE_STAFF_REQUIRED = 'Wybierz osobę';
export const ABSENCE_STARTS_AT_INVALID = 'Wybierz początek Nieobecności';
export const ABSENCE_ENDS_AT_INVALID = 'Wybierz koniec Nieobecności';
export const ABSENCE_REASON_TOO_LONG = `Powód może mieć najwyżej ${ABSENCE_REASON_MAX_LENGTH} znaków`;
/** `422` */
export const ABSENCE_ENDS_BEFORE_START =
  'Koniec Nieobecności musi być po jej początku';
/** `422`: another Salon's person or a deleted one. */
export const ABSENCE_STAFF_UNAVAILABLE =
  'Tej osobie nie można wpisać Nieobecności';

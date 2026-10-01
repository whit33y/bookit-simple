import type { AbsenceView } from './absences';
import type { CalendarDay } from './calendar-day';
import type { Holiday } from './holidays';
import type { OpeningHoursDay } from './opening-hours';
import type { VisitView } from './visits';

/**
 * `GET /api/calendar` query: Polish calendar days, both included, at most
 * `CALENDAR_MAX_DAYS` of them.
 */
export interface CalendarQuery {
  from: CalendarDay;
  to: CalendarDay;
}

/** A column of the calendar. */
export interface CalendarStaffMember {
  id: string;
  displayName: string;
  /**
   * Only for an Usunięta osoba z Personelu: the day of her last `SCHEDULED` Wizyta,
   * the last one her column is shown on. `null` for the rest of the Personel.
   */
  visibleUntil: CalendarDay | null;
}

/** A Wizyta in the calendar, with its Klient ("Klient usunięty" after removal). */
export interface CalendarVisit extends VisitView {
  client: { name: string; phoneE164: string | null };
}

/**
 * `GET /api/calendar` reply: everything to draw the range.
 * - `staff`: people who Przyjmują Wizyty in their order, then the Usunięte osoby z
 *   Personelu with a `SCHEDULED` Wizyta on `from` or later;
 * - `visits`: `SCHEDULED` and `NO_SHOW` ones whose time, with the Przerwa, overlaps the
 *   range, so one that started the day before and goes past midnight comes too;
 * - `absences`: the ones overlapping the range;
 * - `holidays`: the Święta in the range, in date order;
 * - `openingHours`: the weekly Godziny otwarcia, open weekdays only.
 */
export interface CalendarResponse {
  staff: CalendarStaffMember[];
  visits: CalendarVisit[];
  absences: AbsenceView[];
  holidays: Holiday[];
  openingHours: OpeningHoursDay[];
}

export const CALENDAR_MAX_DAYS = 31;

/** `400` for `from` or `to` missing or not a real `YYYY-MM-DD`. */
export const CALENDAR_DAY_INVALID = 'Podaj dni w formacie RRRR-MM-DD';
/** `422` for `to` before `from`. */
export const CALENDAR_RANGE_REVERSED =
  'Koniec zakresu nie może być przed jego początkiem';
/** `422` for more than `CALENDAR_MAX_DAYS` days. */
export const CALENDAR_RANGE_TOO_LONG = `Zakres może mieć najwyżej ${CALENDAR_MAX_DAYS} dni`;

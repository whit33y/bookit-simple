/**
 * Godziny otwarcia of one weekday in `GET` and `PUT /api/opening-hours`. The body is
 * an array of these; a missing weekday is closed. `PUT` replies with the saved array.
 */
export interface OpeningHoursDay {
  /** 1 = Monday ... 7 = Sunday */
  weekday: number;
  /** `HH:mm` */
  opensAt: string;
  /** `HH:mm`, later than `opensAt` */
  closesAt: string;
}

/** `HH:mm`, 00:00 to 23:59. */
export const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Names of the weekdays in the UI, Monday first: `WEEKDAY_NAMES[weekday - 1]`. */
export const WEEKDAY_NAMES = [
  'Poniedziałek',
  'Wtorek',
  'Środa',
  'Czwartek',
  'Piątek',
  'Sobota',
  'Niedziela',
] as const;

/** Monday to Friday, the days "skopiuj na dni robocze" fills in. */
export const WORKING_WEEKDAYS = [1, 2, 3, 4, 5] as const;

/** `400` for a time that is not `HH:mm`. */
export const OPENING_HOURS_INVALID_TIME = 'Podaj godzinę w formacie GG:MM';
/** `400` for a weekday outside 1–7. */
export const OPENING_HOURS_INVALID_WEEKDAY =
  'Dzień tygodnia musi być liczbą od 1 do 7';
/** `400` when one weekday comes twice: one range per day. */
export const OPENING_HOURS_DUPLICATE_WEEKDAY =
  'Każdy dzień może mieć tylko jeden przedział godzin';
/** `422` when `closesAt` is not after `opensAt`, also shown under the row. */
export const OPENING_HOURS_CLOSES_BEFORE_OPENS =
  'Godzina zamknięcia musi być późniejsza niż otwarcia';

/** `HH:mm` strings compare like the times they name. */
export const closesAfterOpens = ({
  opensAt,
  closesAt,
}: Pick<OpeningHoursDay, 'opensAt' | 'closesAt'>): boolean =>
  closesAt > opensAt;

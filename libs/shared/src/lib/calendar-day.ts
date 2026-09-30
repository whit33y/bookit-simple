/** A calendar day, `YYYY-MM-DD`. */
export type CalendarDay = string;

const WARSAW_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The calendar day of `instant` in Europe/Warsaw, e.g. "today" for Ogłoszenia. */
export function warsawDate(instant: Date): CalendarDay {
  return WARSAW_DAY.format(instant);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` naming a day that exists: `2026-02-29` does not. */
export function isCalendarDay(text: string): boolean {
  if (!DAY.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

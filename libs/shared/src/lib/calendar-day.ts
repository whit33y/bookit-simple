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

const WARSAW_HOUR = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Warsaw',
  hour: '2-digit',
  hourCycle: 'h23',
});

const HOUR_MS = 60 * 60 * 1000;

/**
 * The instant Warsaw midnight begins `day`. The clocks change at 2:00 or 3:00 local
 * time, after 00:00 UTC, so the Warsaw hour at 00:00 UTC is the offset of that midnight.
 */
function warsawMidnight(day: CalendarDay): Date {
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  const offsetHours = Number(WARSAW_HOUR.format(utcMidnight));
  return new Date(utcMidnight.getTime() - offsetHours * HOUR_MS);
}

/**
 * The start and end of `day` in Europe/Warsaw, e.g. for a Nieobecność on whole days:
 * from midnight to the next midnight, so a day lasts 23 or 25 hours when the clocks change.
 */
export function warsawDayBounds(day: CalendarDay): {
  startsAt: Date;
  endsAt: Date;
} {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    startsAt: warsawMidnight(day),
    endsAt: warsawMidnight(next.toISOString().slice(0, 10)),
  };
}

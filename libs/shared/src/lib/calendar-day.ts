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

const HOUR_MS = 60 * 60 * 1000;

/**
 * The instant `day` starts in Europe/Warsaw. The clocks change at 2:00 or 3:00, so the
 * offset at 00:00 UTC of that day is the one of its midnight.
 */
export function warsawDayStart(day: CalendarDay): Date {
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  const warsawHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Warsaw',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(utcMidnight),
  );
  return new Date(utcMidnight.getTime() - warsawHour * HOUR_MS);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` naming a day that exists: `2026-02-29` does not. */
export function isCalendarDay(text: string): boolean {
  if (!DAY.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

/**
 * The start and end of `day` in Europe/Warsaw, e.g. for a Nieobecność on whole days:
 * from midnight to the next midnight, so a day lasts 23 or 25 hours when the clocks change.
 */
export function warsawDayBounds(day: CalendarDay): {
  startsAt: Date;
  endsAt: Date;
} {
  return {
    startsAt: warsawDayStart(day),
    endsAt: warsawDayStart(addDays(day, 1)),
  };
}

/** The day `days` after `day` (before it when negative), counted on the calendar. */
export function addDays(day: CalendarDay, days: number): CalendarDay {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const MINUTE_MS = 60 * 1000;

const WARSAW_WALL = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function warsawParts(instant: Date) {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    WARSAW_WALL.formatToParts(instant).find((p) => p.type === type)?.value ??
    '';
  return {
    year: Number(part('year')),
    month: Number(part('month')),
    day: Number(part('day')),
    hour: part('hour'),
    minute: part('minute'),
  };
}

/** Minutes Warsaw is ahead of UTC at `instant`: 60 in winter, 120 in summer. */
function warsawOffsetMin(instant: Date): number {
  const p = warsawParts(instant);
  const wall = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    Number(p.hour),
    Number(p.minute),
  );
  return Math.round((wall - instant.getTime()) / MINUTE_MS);
}

/**
 * The instant the Warsaw clock shows `clock` (`HH:mm`) on `day`, e.g. for the date and
 * time typed in the form of a Wizyta. The offset is taken twice, at the guess and then at
 * the instant it gives, so the hours around a clock change come out right.
 */
export function warsawInstant(day: CalendarDay, clock: string): Date {
  const [hours, minutes] = clock.split(':').map(Number);
  const wall =
    new Date(`${day}T00:00:00Z`).getTime() + (hours * 60 + minutes) * MINUTE_MS;
  const guess = wall - warsawOffsetMin(new Date(wall)) * MINUTE_MS;
  return new Date(wall - warsawOffsetMin(new Date(guess)) * MINUTE_MS);
}

/** `HH:mm` of `instant` on the Warsaw clock, as `<input type="time">` takes it. */
export function warsawTime(instant: Date | string): string {
  const { hour, minute } = warsawParts(new Date(instant));
  return `${hour}:${minute}`;
}

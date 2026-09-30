import { CalendarDay } from '@bookit/shared';

/**
 * `@db.Date` goes through Prisma as a `Date` at midnight UTC. Both ways use UTC only,
 * so the server's time zone never shifts the day.
 */
export const toCalendarDay = (date: Date): CalendarDay =>
  date.toISOString().slice(0, 10);

/** `YYYY-MM-DD` to the `Date` Prisma writes as that `date`. */
export const fromCalendarDay = (day: CalendarDay): Date =>
  new Date(`${day}T00:00:00.000Z`);

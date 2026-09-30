/**
 * `@db.Time` goes through Prisma as a `Date` on 1970-01-01 in UTC. Both ways use UTC
 * only, so the server's time zone never shifts the hours.
 */
export const toClockTime = (date: Date): string =>
  date.toISOString().slice(11, 16);

/** `HH:mm` to the `Date` Prisma writes as that `time`. */
export const fromClockTime = (time: string): Date =>
  new Date(`1970-01-01T${time}:00.000Z`);

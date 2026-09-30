import type { CalendarDay } from './calendar-day';

/** A Polish statutory holiday: the calendar marks it, but it blocks no Wizyty. */
export interface Holiday {
  date: CalendarDay;
  name: string;
}

const FIXED: { month: number; day: number; name: string; since?: number }[] = [
  { month: 1, day: 1, name: 'Nowy Rok' },
  { month: 1, day: 6, name: 'Trzech Króli' },
  { month: 5, day: 1, name: 'Święto Pracy' },
  { month: 5, day: 3, name: 'Święto Konstytucji 3 Maja' },
  { month: 8, day: 15, name: 'Wniebowzięcie Najświętszej Maryi Panny' },
  { month: 11, day: 1, name: 'Wszystkich Świętych' },
  { month: 11, day: 11, name: 'Święto Niepodległości' },
  { month: 12, day: 24, name: 'Wigilia Bożego Narodzenia', since: 2025 },
  { month: 12, day: 25, name: 'Boże Narodzenie (pierwszy dzień)' },
  { month: 12, day: 26, name: 'Boże Narodzenie (drugi dzień)' },
];

/** Days after Wielkanoc. */
const MOVABLE: { offset: number; name: string }[] = [
  { offset: 0, name: 'Wielkanoc' },
  { offset: 1, name: 'Poniedziałek Wielkanocny' },
  { offset: 49, name: 'Zielone Świątki' },
  { offset: 60, name: 'Boże Ciało' },
];

/** Wielkanoc in the Gregorian calendar, by the Meeus/Jones/Butcher algorithm, at 00:00 UTC. */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const DAY_MS = 24 * 60 * 60 * 1000;

const calendarDay = (date: Date): CalendarDay =>
  date.toISOString().slice(0, 10);

/** The Święta of `year`, in date order. */
export function polishHolidays(year: number): Holiday[] {
  const fixed = FIXED.filter(
    (holiday) => !holiday.since || year >= holiday.since,
  ).map(({ month, day, name }) => ({
    date: calendarDay(new Date(Date.UTC(year, month - 1, day))),
    name,
  }));
  const easterTime = easter(year).getTime();
  const movable = MOVABLE.map(({ offset, name }) => ({
    date: calendarDay(new Date(easterTime + offset * DAY_MS)),
    name,
  }));
  return [...fixed, ...movable].sort((x, y) => x.date.localeCompare(y.date));
}

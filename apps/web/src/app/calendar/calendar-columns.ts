import {
  addDays,
  CalendarDay,
  CalendarStaffMember,
  Holiday,
  warsawDate,
  warsawInstant,
  warsawTime,
} from '@bookit/shared';
import { dayColumns, MINUTE_MS, SLOT_MIN } from './day-layout';

/** A column of the calendar grid: one person on one day. */
export interface GridColumn {
  /** Unique in the grid. */
  key: string;
  day: CalendarDay;
  staffMemberId: string;
  /** In the head of the column. */
  label: string;
  /** Before the time in the names of its empty fields, e.g. "Kasia, 9:15". */
  name: string;
  /** An Usunięta osoba z Personelu takes no new Wizyty. */
  deleted: boolean;
  /** The Święto of the day, under the label. */
  holiday?: string;
}

/** Noon UTC of `day`, to print its date in any time zone. */
const noonOf = (day: CalendarDay) => new Date(`${day}T12:00:00Z`);

/** The Monday of the week of `day`. */
export function weekStart(day: CalendarDay): CalendarDay {
  const weekday = noonOf(day).getUTCDay() || 7;
  return addDays(day, 1 - weekday);
}

/** The seven days from `monday`. */
export const weekDays = (monday: CalendarDay): CalendarDay[] =>
  Array.from({ length: 7 }, (_, i) => addDays(monday, i));

const RANGE_TITLE = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "9–15 listopada 2026" */
export const weekTitle = (monday: CalendarDay): string =>
  RANGE_TITLE.formatRange(noonOf(monday), noonOf(addDays(monday, 6)));

/** The columns of the day view: everyone in the calendar on `day`. */
export const personColumns = (
  staff: CalendarStaffMember[],
  day: CalendarDay,
): GridColumn[] =>
  dayColumns(staff, day).map((person) => ({
    key: person.id,
    day,
    staffMemberId: person.id,
    label: person.visibleUntil
      ? `${person.displayName} (usunięta)`
      : person.displayName,
    name: person.displayName,
    deleted: person.visibleUntil !== null,
  }));

const SHORT_DAY = new Intl.DateTimeFormat('pl-PL', {
  weekday: 'short',
  day: 'numeric',
  month: 'numeric',
  timeZone: 'UTC',
});
const LONG_DAY = new Intl.DateTimeFormat('pl-PL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** The columns of the week view: the seven days of `person` from `monday`. */
export const weekColumns = (
  person: CalendarStaffMember,
  monday: CalendarDay,
  holidays: Holiday[],
): GridColumn[] =>
  weekDays(monday).map((day) => {
    const holiday = holidays.find((h) => h.date === day)?.name;
    return {
      key: day,
      day,
      staffMemberId: person.id,
      label: SHORT_DAY.format(noonOf(day)),
      name: LONG_DAY.format(noonOf(day)),
      deleted: person.visibleUntil !== null,
      ...(holiday ? { holiday } : {}),
    };
  });

/** The first of `wanted` who is in `staff`, else the first person of `staff`. */
export function pickPerson(
  staff: CalendarStaffMember[],
  ...wanted: (string | null | undefined)[]
): CalendarStaffMember | undefined {
  for (const id of wanted) {
    const person = id ? staff.find((p) => p.id === id) : undefined;
    if (person) return person;
  }
  return staff[0];
}

const QUARTER_MS = SLOT_MIN * MINUTE_MS;

/**
 * Where the "+" puts a new Wizyta: the next full quarter on today (midnight after
 * 23:45), the same clock time on another day.
 */
export function nextQuarter(now: Date, day: CalendarDay): Date {
  const next = new Date(Math.ceil(now.getTime() / QUARTER_MS) * QUARTER_MS);
  return day === warsawDate(now)
    ? next
    : warsawInstant(day, warsawTime(next));
}

/** How far a finger must go across, in px, to change the person. */
const SWIPE_MIN_PX = 50;

/**
 * The person a swipe goes to: `1` the next one (finger to the left), `-1` the one
 * before, `0` for a short or mostly vertical move.
 */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < 2 * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

const PERSON_KEY = 'bookit.calendar.osoba';

/** The person last looked at; `null` when the browser keeps nothing. */
export function storedPerson(): string | null {
  try {
    return localStorage.getItem(PERSON_KEY);
  } catch {
    return null;
  }
}

export function storePerson(id: string): void {
  try {
    localStorage.setItem(PERSON_KEY, id);
  } catch {
    // A private window: the person is not remembered.
  }
}

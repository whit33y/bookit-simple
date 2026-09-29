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

export interface AnnouncementDays {
  showFrom: CalendarDay;
  /** `null` = no end */
  showUntil: CalendarDay | null;
}

/** The Wizytówka shows an Ogłoszenie from `showFrom` to `showUntil`, both days included. */
export function isAnnouncementVisible(
  { showFrom, showUntil }: AnnouncementDays,
  today: CalendarDay,
): boolean {
  return showFrom <= today && (showUntil === null || today <= showUntil);
}

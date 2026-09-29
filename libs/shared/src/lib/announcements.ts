import { CalendarDay } from './calendar-day';

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

import { CalendarDay, warsawDate } from './calendar-day';

export interface AnnouncementDays {
  showFrom: CalendarDay;
  /** `null` = no end */
  showUntil: CalendarDay | null;
}

/** Where the panel lists an Ogłoszenie: shown now, from a later day, or no longer. */
export type AnnouncementGroup = 'ACTIVE' | 'SCHEDULED' | 'PAST';

/**
 * The group of an Ogłoszenie at `now`. "Today" is the day in Europe/Warsaw, so one that
 * ends today is shown until 23:59 Polish time, wherever the server or browser runs.
 */
export function announcementGroup(
  { showFrom, showUntil }: AnnouncementDays,
  now: Date,
): AnnouncementGroup {
  const today = warsawDate(now);
  if (today < showFrom) return 'SCHEDULED';
  if (showUntil !== null && showUntil < today) return 'PAST';
  return 'ACTIVE';
}

/** The Wizytówka shows an Ogłoszenie from `showFrom` to `showUntil`, both days included. */
export function isAnnouncementVisible(
  announcement: AnnouncementDays,
  now: Date,
): boolean {
  return announcementGroup(announcement, now) === 'ACTIVE';
}

/** One Ogłoszenie in `GET /api/announcements`: all of them, newest `showFrom` first. */
export interface AnnouncementView extends AnnouncementDays {
  id: string;
  title: string;
  body: string;
  photoId: string | null;
}

/** `POST /api/announcements` body. Replies `201` with the new `AnnouncementView`. */
export interface CreateAnnouncementRequest {
  title: string;
  body: string;
  /** A Photo from `POST /api/photos`; `null` when left out. */
  photoId?: string | null;
  showFrom: CalendarDay;
  /** `null` (no end) when left out. */
  showUntil?: CalendarDay | null;
}

/**
 * `PATCH /api/announcements/:id` body: only the fields to change. Replies with the
 * `AnnouncementView`. `DELETE /api/announcements/:id` replies `204`.
 */
export type UpdateAnnouncementRequest = Partial<CreateAnnouncementRequest>;

export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 120;
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 2000;

export const ANNOUNCEMENT_TITLE_REQUIRED = 'Wpisz tytuł';
export const ANNOUNCEMENT_TITLE_TOO_LONG = `Tytuł może mieć najwyżej ${ANNOUNCEMENT_TITLE_MAX_LENGTH} znaków`;
export const ANNOUNCEMENT_BODY_REQUIRED = 'Wpisz treść';
export const ANNOUNCEMENT_BODY_TOO_LONG = `Treść może mieć najwyżej ${ANNOUNCEMENT_BODY_MAX_LENGTH} znaków`;
/** `400` for a `showFrom` that is not a `YYYY-MM-DD` day. */
export const ANNOUNCEMENT_SHOW_FROM_INVALID =
  'Wybierz dzień, od którego pokazać';
/** `400` for a `showUntil` that is neither a `YYYY-MM-DD` day nor `null`. */
export const ANNOUNCEMENT_SHOW_UNTIL_INVALID =
  'Wybierz dzień, do którego pokazać';
/** `422` when `showUntil` is before `showFrom`, also after a `PATCH` of just one of them. */
export const ANNOUNCEMENT_ENDS_BEFORE_START =
  'Dzień końca nie może być przed dniem początku';
/** `400` for a `photoId` the Salon does not have. */
export const ANNOUNCEMENT_PHOTO_NOT_FOUND = 'Nie ma takiego zdjęcia';

/** `YYYY-MM-DD` strings compare like the days they name. */
export const endsOnOrAfterStart = ({
  showFrom,
  showUntil,
}: AnnouncementDays): boolean => showUntil === null || showFrom <= showUntil;

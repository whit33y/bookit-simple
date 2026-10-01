import type { VisitView } from './visits';

/**
 * The form of a name that search compares: lowercase, without Polish marks, single spaces.
 * NFD splits `ą` into `a` and a mark, but `ł` is a letter of its own, so it goes separately.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Fewer digits than this match too many numbers to be worth searching by. */
export const PHONE_SEARCH_MIN_DIGITS = 3;

/**
 * The digits to look for in `phoneE164`, or `null` if the query is not a phone: it has a
 * letter (a name, e.g. "Anna 2") or too few digits. A leading `00` is the international
 * prefix typed instead of `+`.
 */
export function phoneSearchDigits(query: string): string | null {
  if (/\p{L}/u.test(query)) return null;
  const digits = query.replace(/\D/g, '').replace(/^00/, '');
  return digits.length >= PHONE_SEARCH_MIN_DIGITS ? digits : null;
}

/** One Klient in `GET /api/clients` and `GET /api/clients/:id`. */
export interface ClientView {
  id: string;
  name: string;
  /** E.164, e.g. `+48600100200` */
  phoneE164: string | null;
  notes: string | null;
}

/** `POST /api/clients` body. Replies `201` with the new `ClientView`. */
export interface CreateClientRequest {
  name: string;
  /** Typed in any common way, Poland unless it starts with `+`; empty or `null` = none. */
  phone?: string | null;
  notes?: string | null;
  /**
   * Save even if another Klient of the Salon has this phone. Without it such a save
   * answers `409` with `ClientPhoneTakenResponse`.
   */
  acceptDuplicatePhone?: boolean;
}

/**
 * `PATCH /api/clients/:id` body: only the fields to change. Replies with the `ClientView`.
 * `DELETE /api/clients/:id` (only the Właściciel) replies `204`.
 */
export type UpdateClientRequest = Partial<CreateClientRequest>;

/** `409` body of a save with a phone that other Klienci of the Salon already have. */
export interface ClientPhoneTakenResponse {
  statusCode: 409;
  error: 'Conflict';
  message: string;
  clients: ClientView[];
}

/** At most this many Klienci in one `GET /api/clients`. */
export const CLIENT_SEARCH_LIMIT = 20;

export const CLIENT_NAME_MAX_LENGTH = 100;
export const CLIENT_NOTES_MAX_LENGTH = 2000;

export const CLIENT_NAME_REQUIRED = 'Wpisz imię';
export const CLIENT_NAME_TOO_LONG = `Imię może mieć najwyżej ${CLIENT_NAME_MAX_LENGTH} znaków`;
export const CLIENT_NOTES_TOO_LONG = `Uwagi mogą mieć najwyżej ${CLIENT_NOTES_MAX_LENGTH} znaków`;
/** `409` message; the body also lists the Klienci with that phone. */
export const CLIENT_PHONE_TAKEN = 'Ten numer ma już inny Klient';
/** The fixed hint under "Uwagi" (ADR 0003). */
export const CLIENT_NOTES_HINT =
  'Nie wpisuj tu informacji o zdrowiu (alergie, choroby, leki)';
/** What is left of the name of a deleted Klient, also on their past Wizyty. */
export const DELETED_CLIENT_NAME = 'Klient usunięty';

/** A Wizyta on the karta Klienta, with its person: also an Usunięta osoba z Personelu. */
export interface ClientVisit extends VisitView {
  staffMember: { displayName: string; deleted: boolean };
}

/** Counted over all Wizyty of the Klient, not only the page. */
export interface ClientVisitStats {
  /** Every Wizyta, in any Stan Wizyty, past and future. */
  visits: number;
  cancelled: number;
  noShow: number;
  /** ISO 8601 start of the latest Wizyta that took place: `SCHEDULED` and already started. */
  lastVisitAt: string | null;
}

/**
 * `GET /api/clients/:id/visits?page=` reply: every Wizyta of the Klient, also cancelled
 * and no-show ones, newest first, `CLIENT_VISITS_PAGE_SIZE` a page; `page` counts from 1.
 * `404` for a deleted Klient.
 */
export interface ClientVisitPage {
  items: ClientVisit[];
  page: number;
  pageSize: number;
  total: number;
  stats: ClientVisitStats;
}

export const CLIENT_VISITS_PAGE_SIZE = 20;
/** `400` for a `page` that is not a whole number from 1. */
export const CLIENT_VISITS_PAGE_INVALID = 'Nieprawidłowy numer strony';

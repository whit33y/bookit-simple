/** Which Wizytówka sections are shown (`Salon.sections`). */
export interface PageSections {
  announcements: boolean;
  about: boolean;
  pricing: boolean;
  team: boolean;
  gallery: boolean;
  hours: boolean;
  contact: boolean;
}

/** A new Salon starts with every section on; the Właściciel turns them off in #20. */
export const ALL_PAGE_SECTIONS: PageSections = {
  announcements: true,
  about: true,
  pricing: true,
  team: true,
  gallery: true,
  hours: true,
  contact: true,
};

/** `Salon.sections` as stored: only the known sections, as booleans; a missing one is on. */
export function pageSections(stored: unknown): PageSections {
  const saved = (stored && typeof stored === 'object' ? stored : {}) as Partial<
    Record<string, unknown>
  >;
  const sections = { ...ALL_PAGE_SECTIONS };
  for (const key of Object.keys(sections) as (keyof PageSections)[]) {
    const value = saved[key];
    if (typeof value === 'boolean') sections[key] = value;
  }
  return sections;
}

/** Accent colour of a new Salon's Wizytówka, the violet of the panel. */
export const DEFAULT_ACCENT_COLOR = '#6750a4';

export interface SalonAddress {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

/** "ul. Piotrkowska 120, 90-006 Łódź"; empty when nothing is known. */
export function addressLine({
  street,
  postalCode,
  city,
}: SalonAddress): string {
  const town = [postalCode?.trim(), city?.trim()].filter(Boolean).join(' ');
  return [street?.trim(), town].filter(Boolean).join(', ');
}

const MAP_SEARCH_URL = 'https://www.google.com/maps/search/?api=1&query=';

/** Google Maps search for the address, the link the panel fills in; null without an address. */
export function mapSearchUrl(address: SalonAddress): string | null {
  const line = addressLine(address);
  return line ? MAP_SEARCH_URL + encodeURIComponent(line) : null;
}

/** A link `mapSearchUrl` made, which a new address replaces; a pasted one stays. */
export function isMapSearchUrl(url: string): boolean {
  return url.startsWith(MAP_SEARCH_URL);
}

export interface PrivacyNoticeFields {
  salonName: string;
  /** One line, e.g. "ul. Piotrkowska 120, 90-006 Łódź". */
  address?: string | null;
  email?: string | null;
}

/** Stands in for data the Właściciel has not filled in yet. */
export const PRIVACY_NOTICE_BLANK = '[uzupełnij]';

/**
 * Klauzula informacyjna RODO (art. 13) for Klienci who book Wizyty, in plain text with
 * paragraphs. A new Salon gets it filled with what is known; the Właściciel edits it in #20.
 *
 * TODO: the wording needs a lawyer's review before the Wizytówka goes public.
 */
export function privacyNoticeTemplate({
  salonName,
  address,
  email,
}: PrivacyNoticeFields): string {
  const addressText = address?.trim() || PRIVACY_NOTICE_BLANK;
  const emailText = email?.trim() || PRIVACY_NOTICE_BLANK;
  return [
    `Administratorem Twoich danych osobowych jest ${salonName}, ${addressText}. W sprawach dotyczących danych możesz pisać na adres ${emailText}.`,
    'Przetwarzamy Twoje imię i numer telefonu, aby umówić Cię na Wizytę, przypomnieć o niej i ją obsłużyć. Podstawą jest art. 6 ust. 1 lit. b RODO, czyli działania przed zawarciem umowy i jej wykonanie na Twoje żądanie.',
    'Dane przechowujemy przez czas korzystania z naszych usług, a potem do upływu terminu przedawnienia roszczeń. Nie przekazujemy ich innym firmom poza dostawcą systemu rezerwacji, który przetwarza je na nasze zlecenie.',
    'Masz prawo dostępu do swoich danych, ich sprostowania, usunięcia lub ograniczenia przetwarzania, przeniesienia oraz wniesienia sprzeciwu. Możesz też złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych.',
    'Podanie danych jest dobrowolne, ale bez nich nie umówimy Wizyty.',
  ].join('\n\n');
}

/** `GET /api/salon/page`, also the reply to `PATCH`: the Wizytówka as the Właściciel edits it. */
export interface SalonPageSettings {
  /** Read only here; the Administrator names the Salon. */
  name: string;
  /** Adres wizytówki, read only here; for "Otwórz Wizytówkę". */
  slug: string;
  about: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  /** E.164, e.g. `+48600123456` */
  phone: string | null;
  email: string | null;
  /** Always `https://` */
  mapUrl: string | null;
  /** `#rrggbb`, lowercase */
  accentColor: string;
  logoPhotoId: string | null;
  heroPhotoId: string | null;
  sections: PageSections;
  privacyNotice: string | null;
}

/**
 * `PATCH /api/salon/page` body. Fields left out stay as they are; `null` or a blank text
 * clears one. `phone` in any common format, stored in E.164. `sections` may name only
 * the sections that change. Every invalid value answers `422` with the message below.
 */
export type UpdateSalonPageRequest = Partial<
  Omit<SalonPageSettings, 'name' | 'slug' | 'accentColor' | 'sections'>
> & {
  accentColor?: string;
  sections?: Partial<PageSections>;
};

export const SALON_TEXT_MAX_LENGTH = 200;
export const SALON_ABOUT_MAX_LENGTH = 2000;
export const PRIVACY_NOTICE_MAX_LENGTH = 10000;
/** A full Google Maps link is longer than other texts. */
export const MAP_URL_MAX_LENGTH = 2000;

export const ACCENT_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/** Only `https://` links, so a `javascript:` one never ends up on the Wizytówka. */
export function isSafeMapUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname !== '';
  } catch {
    return false;
  }
}

export const SALON_TEXT_TOO_LONG = `Tekst może mieć najwyżej ${SALON_TEXT_MAX_LENGTH} znaków`;
export const SALON_ABOUT_TOO_LONG = `Opis może mieć najwyżej ${SALON_ABOUT_MAX_LENGTH} znaków`;
export const PRIVACY_NOTICE_TOO_LONG = `Klauzula może mieć najwyżej ${PRIVACY_NOTICE_MAX_LENGTH} znaków`;
export const SALON_EMAIL_INVALID = 'Nieprawidłowy e-mail';
export const MAP_URL_TOO_LONG = `Link może mieć najwyżej ${MAP_URL_MAX_LENGTH} znaków`;
export const MAP_URL_INVALID = 'Link do mapy musi zaczynać się od https://';
export const ACCENT_COLOR_INVALID = 'Kolor wpisz jako #rrggbb, np. #c0392b';
/** `422` for a `logoPhotoId` or `heroPhotoId` that is not a Photo of the Salon. */
export const SALON_PHOTO_NOT_FOUND = 'Nie ma takiego zdjęcia';
export const SALON_SECTIONS_INVALID = 'Nieprawidłowe sekcje Wizytówki';

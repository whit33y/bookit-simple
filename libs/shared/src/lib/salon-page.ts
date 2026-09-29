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

// Full metadata: the default one accepts numbers of a wrong length, e.g. 8 digits in Poland.
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export interface Phone {
  /** How it is stored, e.g. `+48600123456`. */
  e164: string;
  /** How it is shown, e.g. `+48 600 123 456`. */
  international: string;
}

export const PHONE_INVALID = 'Nieprawidłowy numer telefonu';

/** A phone number typed in any common way; Poland unless it starts with `+`. `null` if invalid. */
export function parsePhone(raw: string): Phone | null {
  const phone = parsePhoneNumberFromString(raw, 'PL');
  if (!phone?.isValid()) return null;
  return { e164: phone.number, international: phone.formatInternational() };
}

import { RESERVED_SLUGS } from './reserved-slugs';

export const MIN_SLUG_LENGTH = 3;
export const MAX_SLUG_LENGTH = 40;

/** ADR 0002: lowercase letters, digits and dashes, starting and ending with a letter or digit. */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Why an Adres wizytówki cannot be used. `TAKEN` only the API knows. */
export type SlugError = 'TOO_SHORT' | 'TOO_LONG' | 'INVALID' | 'RESERVED';

/** Why an address cannot be taken: its form, or another Salon has or had it. */
export type SlugUnavailableReason = SlugError | 'TAKEN';

/** What the form and the API say for each reason. */
export const SLUG_ERROR_MESSAGES: Record<SlugUnavailableReason, string> = {
  TOO_SHORT: `Adres wizytówki musi mieć co najmniej ${MIN_SLUG_LENGTH} znaki`,
  TOO_LONG: `Adres wizytówki może mieć najwyżej ${MAX_SLUG_LENGTH} znaków`,
  INVALID:
    'Użyj małych liter bez polskich znaków, cyfr i pojedynczych myślników, bez myślnika na początku i końcu',
  RESERVED: 'Ten adres jest zarezerwowany',
  TAKEN: 'Ten adres jest już zajęty',
};

/** `null` when `slug` can be an Adres wizytówki, as far as its form goes. */
export function validateSlug(slug: string): SlugError | null {
  if (slug.length < MIN_SLUG_LENGTH) return 'TOO_SHORT';
  if (slug.length > MAX_SLUG_LENGTH) return 'TOO_LONG';
  if (!SLUG_PATTERN.test(slug) || slug.includes('--')) return 'INVALID';
  if (RESERVED_SLUGS.includes(slug)) return 'RESERVED';
  return null;
}

/**
 * An Adres wizytówki suggested from the Salon's name: "Łódź Nails & Spa" → `lodz-nails-spa`.
 * NFD splits most Polish letters into a base letter and a mark, but not `ł`, so it is
 * mapped first. The result may still fail `validateSlug` (e.g. too short or reserved).
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}

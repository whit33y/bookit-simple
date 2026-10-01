import {
  addressLine,
  PageSections,
  PublicPage,
  photoUrl,
  warsawDate,
} from '@bookit/shared';

/** Relative luminance of a `#rrggbb` colour (WCAG 2). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** White or black, whichever reads better on a button in the `accent` colour. */
export function onAccentColor(accent: string): '#ffffff' | '#000000' {
  const l = luminance(accent);
  const onWhite = 1.05 / (l + 0.05);
  const onBlack = (l + 0.05) / 0.05;
  return onWhite >= onBlack ? '#ffffff' : '#000000';
}

/** Plain text from the Właściciel in paragraphs, split on blank lines; no HTML. */
export function paragraphs(text: string | null): string[] {
  return (text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

const DESCRIPTION_MAX_LENGTH = 160;

/** `<meta name="description">`: O nas on one line, at most 160 characters, cut on a word. */
export function metaDescription(about: string | null): string {
  const text = (about ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= DESCRIPTION_MAX_LENGTH) return text;
  const cut = text.slice(0, DESCRIPTION_MAX_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Default czas trwania of a Usługa on the Cennik: "45 min", "1 godz. 15 min". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} godz.` : `${hours} godz. ${rest} min`;
}

/**
 * What Google shows under the link: O nas, unless the Właściciel turned it off or left
 * it empty; then the name and address, so the page still has a description.
 */
export function pageDescription(
  salon: Pick<
    PublicPage['salon'],
    'name' | 'about' | 'street' | 'postalCode' | 'city'
  >,
  sections: Pick<PageSections, 'about'>,
): string {
  const about = sections.about ? metaDescription(salon.about) : '';
  return about || [salon.name, addressLine(salon)].filter(Boolean).join(', ');
}

/** Today's weekday in Europe/Warsaw, 1 = Monday ... 7 = Sunday, like `OpeningHours`. */
export function warsawWeekday(now: Date): number {
  const day = new Date(`${warsawDate(now)}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

const SCHEMA_WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** Drops the keys whose value is `null`, `undefined` or `''`. */
function compact<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, field]) => field !== null && field !== undefined && field !== '',
    ),
  ) as Partial<T>;
}

/**
 * schema.org `BeautySalon` for Google, with only what the Salon filled in and shows. `origin` is
 * where the Wizytówka is served, e.g. `https://bookit.pl`, for absolute links.
 */
export function salonJsonLd(page: PublicPage, origin: string): object {
  const { salon } = page;
  const hasAddress = salon.street || salon.postalCode || salon.city;
  return compact({
    '@context': 'https://schema.org',
    '@type': 'BeautySalon',
    name: salon.name,
    url: `${origin}/${salon.slug}`,
    description: pageDescription(salon, page.sections),
    image: salon.hero ? `${origin}${photoUrl(salon.hero.id)}` : null,
    telephone: salon.phone,
    email: salon.email,
    address: hasAddress
      ? compact({
          '@type': 'PostalAddress',
          streetAddress: salon.street,
          postalCode: salon.postalCode,
          addressLocality: salon.city,
          addressCountry: 'PL',
        })
      : null,
    hasMap: salon.mapUrl,
    openingHoursSpecification:
      page.sections.hours && page.openingHours.length
        ? page.openingHours.map((day) => ({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: `https://schema.org/${SCHEMA_WEEKDAYS[day.weekday - 1]}`,
            opens: day.opensAt,
            closes: day.closesAt,
          }))
        : null,
  });
}

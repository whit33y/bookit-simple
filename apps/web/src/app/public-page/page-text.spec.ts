import { DEFAULT_PAGE_SECTION_ORDER } from '@bookit/shared';
import { PublicPage } from '@bookit/shared';
import {
  formatDuration,
  metaDescription,
  onAccentColor,
  pageDescription,
  paragraphs,
  salonJsonLd,
  warsawWeekday,
} from './page-text';

describe('onAccentColor', () => {
  it.each([
    ['#6750a4', '#ffffff'],
    ['#c0392b', '#ffffff'],
    ['#000000', '#ffffff'],
    ['#ffffff', '#000000'],
    ['#f1c40f', '#000000'],
    ['#7fdbff', '#000000'],
  ])('puts readable text on %s', (accent, text) => {
    expect(onAccentColor(accent)).toBe(text);
  });
});

describe('paragraphs', () => {
  it('splits plain text on blank lines', () => {
    expect(paragraphs('Pierwszy.\n\n  \nDrugi,\ndwie linie.\n')).toEqual([
      'Pierwszy.',
      'Drugi,\ndwie linie.',
    ]);
  });

  it('accepts Windows line endings', () => {
    expect(paragraphs('Pierwszy.\r\n\r\nDrugi.')).toEqual([
      'Pierwszy.',
      'Drugi.',
    ]);
  });

  it('is empty without text', () => {
    expect(paragraphs(null)).toEqual([]);
    expect(paragraphs(' \n\n ')).toEqual([]);
  });
});

describe('metaDescription', () => {
  it('takes O nas on one line', () => {
    expect(metaDescription('Salon w centrum.\n\nZapraszamy!')).toBe(
      'Salon w centrum. Zapraszamy!',
    );
  });

  it('cuts at most 160 characters, on a word, with an ellipsis', () => {
    const about = `${'Fryzjer '.repeat(30)}koniec`;

    const description = metaDescription(about);

    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toMatch(/Fryzjer…$/);
  });

  it('is empty without O nas', () => {
    expect(metaDescription(null)).toBe('');
  });
});

describe('pageDescription', () => {
  const salon = {
    name: 'Studio Kora',
    about: 'Salon w Krakowie.',
    street: 'ul. Długa 12',
    postalCode: '31-147',
    city: 'Kraków',
  };

  it('is O nas when the section is on', () => {
    expect(pageDescription(salon, { about: true })).toBe('Salon w Krakowie.');
  });

  it('is the name and address when O nas is off or empty', () => {
    const expected = 'Studio Kora, ul. Długa 12, 31-147 Kraków';
    expect(pageDescription(salon, { about: false })).toBe(expected);
    expect(pageDescription({ ...salon, about: null }, { about: true })).toBe(
      expected,
    );
  });
});

describe('formatDuration', () => {
  it.each([
    [10, '10 min'],
    [45, '45 min'],
    [60, '1 godz.'],
    [75, '1 godz. 15 min'],
    [180, '3 godz.'],
  ])('%i minutes is "%s"', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});

describe('warsawWeekday', () => {
  it('counts the day in Europe/Warsaw, Monday = 1 to Sunday = 7', () => {
    // Sunday 23:30 in Warsaw (UTC+2) is still Sunday there, Monday nowhere yet.
    expect(warsawWeekday(new Date('2026-09-27T21:30:00Z'))).toBe(7);
    expect(warsawWeekday(new Date('2026-09-27T22:00:00Z'))).toBe(1);
  });
});

describe('salonJsonLd', () => {
  const page: PublicPage = {
    salon: {
      name: 'Studio Kora',
      slug: 'studio-kora',
      about: 'Salon w Krakowie',
      street: 'ul. Długa 12',
      postalCode: '31-147',
      city: 'Kraków',
      phone: '+48600100200',
      email: 'kontakt@kora.test',
      mapUrl: 'https://maps.example/kora',
      accentColor: '#c0392b',
      headerLayout: 'CLASSIC',
      logo: null,
      hero: { id: 'hero-id', width: 1600, height: 900 },
    },
    sectionOrder: DEFAULT_PAGE_SECTION_ORDER,
    sections: {
      announcements: true,
      about: true,
      pricing: true,
      team: true,
      gallery: true,
      hours: true,
      contact: true,
    },
    categories: [],
    announcements: [],
    staff: [],
    gallery: [],
    openingHours: [
      { weekday: 1, opensAt: '09:00', closesAt: '19:00' },
      { weekday: 6, opensAt: '09:00', closesAt: '15:00' },
    ],
    privacyNotice: null,
  };

  it('describes the BeautySalon with address, phone and Godziny otwarcia', () => {
    expect(salonJsonLd(page, 'https://bookit.test')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BeautySalon',
      name: 'Studio Kora',
      url: 'https://bookit.test/studio-kora',
      description: 'Salon w Krakowie',
      image: 'https://bookit.test/api/public/photos/hero-id',
      telephone: '+48600100200',
      email: 'kontakt@kora.test',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'ul. Długa 12',
        postalCode: '31-147',
        addressLocality: 'Kraków',
        addressCountry: 'PL',
      },
      hasMap: 'https://maps.example/kora',
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: 'https://schema.org/Monday',
          opens: '09:00',
          closes: '19:00',
        },
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: 'https://schema.org/Saturday',
          opens: '09:00',
          closes: '15:00',
        },
      ],
    });
  });

  it('leaves out O nas and Godziny otwarcia when their sections are off', () => {
    const ld = salonJsonLd(
      { ...page, sections: { ...page.sections, about: false, hours: false } },
      'https://bookit.test',
    );

    expect(ld).not.toHaveProperty('openingHoursSpecification');
    expect(ld).toHaveProperty(
      'description',
      'Studio Kora, ul. Długa 12, 31-147 Kraków',
    );
  });

  it('leaves out what the Salon has not filled in', () => {
    const bare: PublicPage = {
      ...page,
      salon: {
        ...page.salon,
        about: null,
        street: null,
        postalCode: null,
        city: null,
        phone: null,
        email: null,
        mapUrl: null,
        hero: null,
      },
      openingHours: [],
    };

    expect(salonJsonLd(bare, 'https://bookit.test')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BeautySalon',
      name: 'Studio Kora',
      url: 'https://bookit.test/studio-kora',
      description: 'Studio Kora',
    });
  });
});

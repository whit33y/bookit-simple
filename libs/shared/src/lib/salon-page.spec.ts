import {
  addressLine,
  pageSectionOrder,
  isMapSearchUrl,
  isSafeMapUrl,
  mapSearchUrl,
  PRIVACY_NOTICE_BLANK,
  privacyNoticeTemplate,
} from './salon-page';

describe('addressLine', () => {
  it.each([
    [
      { street: 'ul. Piotrkowska 120', postalCode: '90-006', city: 'Łódź' },
      'ul. Piotrkowska 120, 90-006 Łódź',
    ],
    [{ street: ' ', postalCode: null, city: 'Łódź' }, 'Łódź'],
    [{ street: 'ul. Piotrkowska 120' }, 'ul. Piotrkowska 120'],
    [{}, ''],
  ])('%j → %j', (address, line) => {
    expect(addressLine(address)).toBe(line);
  });
});

describe('mapSearchUrl', () => {
  it('searches Google Maps for the address', () => {
    expect(
      mapSearchUrl({
        street: 'ul. Długa 12',
        postalCode: '31-147',
        city: 'Kraków',
      }),
    ).toBe(
      'https://www.google.com/maps/search/?api=1&query=ul.%20D%C5%82uga%2012%2C%2031-147%20Krak%C3%B3w',
    );
  });

  it('is null without an address', () => {
    expect(mapSearchUrl({ street: ' ', city: null })).toBeNull();
  });
});

describe('isMapSearchUrl', () => {
  it.each([
    [mapSearchUrl({ city: 'Kraków' }) ?? '', true],
    ['https://maps.app.goo.gl/abc123', false],
    ['https://www.google.com/maps/place/Studio+Kora', false],
    ['', false],
  ])('%j → %j', (url, generated) => {
    expect(isMapSearchUrl(url)).toBe(generated);
  });
});

describe('privacyNoticeTemplate', () => {
  it('fills in the Salon name, address and e-mail', () => {
    const text = privacyNoticeTemplate({
      salonName: 'Studio Kora',
      address: 'ul. Piotrkowska 120, 90-006 Łódź',
      email: 'kontakt@studiokora.pl',
    });

    expect(text).toContain(
      'Administratorem Twoich danych osobowych jest Studio Kora, ul. Piotrkowska 120, 90-006 Łódź.',
    );
    expect(text).toContain('kontakt@studiokora.pl');
    expect(text).toContain('art. 6 ust. 1 lit. b RODO');
    expect(text).not.toContain(PRIVACY_NOTICE_BLANK);
  });

  it('leaves a blank to fill in for a missing address and e-mail', () => {
    const text = privacyNoticeTemplate({
      salonName: 'Studio Kora',
      address: ' ',
    });

    expect(text.split(PRIVACY_NOTICE_BLANK)).toHaveLength(3);
  });

  it('is plain text split into paragraphs', () => {
    const text = privacyNoticeTemplate({ salonName: 'Studio Kora' });

    expect(text).not.toMatch(/[<>]/);
    expect(text.split('\n\n').length).toBeGreaterThan(3);
  });
});

describe('isSafeMapUrl', () => {
  it.each([
    ['https://maps.app.goo.gl/abc123', true],
    ['https://www.google.com/maps/place/Studio+Kora', true],
    ['http://maps.google.com', false],
    ['javascript:alert(1)', false],
    ['JavaScript://https://example.com', false],
    ['data:text/html,hi', false],
    ['maps.google.com', false],
    ['https://', false],
    ['', false],
  ])('%j → %j', (url, safe) => {
    expect(isSafeMapUrl(url)).toBe(safe);
  });
});

describe('pageSectionOrder', () => {
  it.each([undefined, null])(
    'uses the original order for older data %s',
    (stored) => {
      expect(pageSectionOrder(stored)).toEqual([
        'announcements',
        'about',
        'pricing',
        'team',
        'gallery',
        'hours',
        'contact',
      ]);
    },
  );
});

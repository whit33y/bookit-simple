import {
  addressLine,
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

import { RESERVED_SLUGS } from './reserved-slugs';

describe('RESERVED_SLUGS', () => {
  it('lists every name a Salon cannot take as its Adres wizytówki', () => {
    expect(RESERVED_SLUGS).toEqual([
      'admin',
      'api',
      'app',
      'panel',
      'login',
      'logowanie',
      'zaproszenie',
      'reset-hasla',
      'www',
      'static',
      'assets',
      'health',
    ]);
  });
});

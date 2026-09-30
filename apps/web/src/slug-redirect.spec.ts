import { movedPath, currentSlugFromApi } from './slug-redirect';

describe('movedPath', () => {
  const lookup = vi.fn(async (slug: string) =>
    slug === 'stary-adres' ? 'nowy-adres' : null,
  );

  beforeEach(() => lookup.mockClear());

  it.each([
    ['/stary-adres', '/nowy-adres'],
    ['/stary-adres/', '/nowy-adres/'],
    ['/stary-adres/prywatnosc', '/nowy-adres/prywatnosc'],
    [
      '/stary-adres/prywatnosc?utm_source=ulotka',
      '/nowy-adres/prywatnosc?utm_source=ulotka',
    ],
  ])('moves %s to %s', async (url, moved) => {
    expect(await movedPath(url, lookup)).toBe(moved);
  });

  it('leaves a current or unknown address alone', async () => {
    expect(await movedPath('/studio-kora/prywatnosc', lookup)).toBeNull();
  });

  it.each(['/', '/admin/salony', '/logowanie', '/favicon.ico', '/main-abc.js'])(
    'does not ask the API about %s, which cannot be an Adres wizytówki',
    async (url) => {
      expect(await movedPath(url, lookup)).toBeNull();
      expect(lookup).not.toHaveBeenCalled();
    },
  );
});

describe('currentSlugFromApi', () => {
  const reply = (status: number, body: unknown = {}) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it('asks the Wizytówka endpoint without following the redirect', async () => {
    const fetch = reply(301, { slug: 'nowy-adres' });

    const slug = await currentSlugFromApi(
      'http://api:3000',
      fetch,
    )('stary-adres');

    expect(slug).toBe('nowy-adres');
    expect(fetch).toHaveBeenCalledWith(
      'http://api:3000/api/public/pages/stary-adres',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it.each([200, 404, 500])('gives null for %i', async (status) => {
    const lookup = currentSlugFromApi('http://api:3000', reply(status));

    expect(await lookup('studio-kora')).toBeNull();
  });

  it('gives null when the API cannot be reached, so the page still renders', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    expect(
      await currentSlugFromApi('http://api:3000', fetch)('studio-kora'),
    ).toBeNull();
  });
});

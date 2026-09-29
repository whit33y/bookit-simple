import { RESERVED_SLUGS } from './reserved-slugs';
import { slugify, validateSlug } from './slug';

describe('slugify', () => {
  it.each([
    ['Studio Kora', 'studio-kora'],
    ['Łódź Nails & Spa', 'lodz-nails-spa'],
    ['Żaneta  Beauty!!', 'zaneta-beauty'],
    ['ŁAŃCUT Ćma Źrebię Ęą Óś', 'lancut-cma-zrebie-ea-os'],
    ['  --Salon 24--  ', 'salon-24'],
    ['Café Crème', 'cafe-creme'],
  ])('%j → %j', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('cuts to 40 characters without leaving a dash at the end', () => {
    const slug = slugify(
      'Bardzo długa nazwa salonu fryzjerskiego i kosmetycznego',
    );
    expect(slug).toBe('bardzo-dluga-nazwa-salonu-fryzjerskiego');
    expect(validateSlug(slug)).toBeNull();
  });

  it('returns an empty string for a name without letters or digits', () => {
    expect(slugify('!!! ***')).toBe('');
  });
});

describe('validateSlug', () => {
  it.each(['abc', 'studio-kora', 'salon-24', '24h', 'a'.repeat(40)])(
    'accepts %j',
    (slug) => {
      expect(validateSlug(slug)).toBeNull();
    },
  );

  it.each([
    ['', 'TOO_SHORT'],
    ['ab', 'TOO_SHORT'],
    ['a'.repeat(41), 'TOO_LONG'],
    ['Studio', 'INVALID'],
    ['studio_kora', 'INVALID'],
    ['łódź', 'INVALID'],
    ['-studio', 'INVALID'],
    ['studio-', 'INVALID'],
    ['studio--kora', 'INVALID'],
    ['studio kora', 'INVALID'],
  ] as const)('rejects %j with %s', (slug, error) => {
    expect(validateSlug(slug)).toBe(error);
  });

  it.each(RESERVED_SLUGS)('rejects the reserved %j', (slug) => {
    expect(validateSlug(slug)).toBe('RESERVED');
  });
});

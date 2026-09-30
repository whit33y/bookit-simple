import { normalizeName, phoneSearchDigits } from './clients';

describe('normalizeName', () => {
  it.each([
    ['Łucja', 'lucja'],
    ['ŁUKASZ Żółć', 'lukasz zolc'],
    ['Zofia Gęślą Jaźń', 'zofia gesla jazn'],
    ['  Anna   Maria  ', 'anna maria'],
    ['Ćma Ńżś', 'cma nzs'],
  ])('%j → %j', (name, normalized) => {
    expect(normalizeName(name)).toBe(normalized);
  });
});

describe('phoneSearchDigits', () => {
  it.each([
    ['600100', '600100'],
    ['600 100-2', '6001002'],
    ['+48 600', '48600'],
    // A number typed with the international prefix still finds `+48…`.
    ['0048 600', '48600'],
  ])('%j → %j', (query, digits) => {
    expect(phoneSearchDigits(query)).toBe(digits);
  });

  it.each(['Anna', '60', 'Anna 600', ''])(
    'is null for %j, which is a name or too short to search by',
    (query) => {
      expect(phoneSearchDigits(query)).toBeNull();
    },
  );
});

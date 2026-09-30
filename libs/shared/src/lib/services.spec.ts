import {
  formatPrice,
  isServiceBreak,
  isServiceDuration,
  parsePrice,
  priceInput,
} from './services';

describe('formatPrice', () => {
  it.each([
    [8000, 'FIXED', '80 zł'],
    [8000, 'FROM', 'od 80 zł'],
    [7950, 'FIXED', '79,50 zł'],
    [7905, 'FROM', 'od 79,05 zł'],
    [0, 'FIXED', '0 zł'],
    [5, 'FIXED', '0,05 zł'],
    [120000, 'FIXED', '1200 zł'],
  ] as const)('%d grosze, %s → %s', (grosze, type, text) => {
    expect(formatPrice(grosze, type)).toBe(text);
  });
});

describe('parsePrice', () => {
  it.each([
    ['80', 8000],
    [' 80 ', 8000],
    ['79,50', 7950],
    ['79,5', 7950],
    ['79.50', 7950],
    ['0,05', 5],
    ['0', 0],
    ['1 200', 120000],
  ])('%j → %d grosze', (text, grosze) => {
    expect(parsePrice(text)).toBe(grosze);
  });

  it.each(['', 'abc', '-5', '79,505', '1,2,3', ',50', '80 zł'])(
    'rejects %j',
    (text) => {
      expect(parsePrice(text)).toBeNull();
    },
  );
});

describe('priceInput', () => {
  it.each([
    [8000, '80'],
    [7950, '79,50'],
    [5, '0,05'],
  ])('%d grosze → %j', (grosze, text) => {
    expect(priceInput(grosze)).toBe(text);
    expect(parsePrice(priceInput(grosze))).toBe(grosze);
  });
});

describe('isServiceDuration', () => {
  it.each([5, 45, 600])('accepts %d', (min) => {
    expect(isServiceDuration(min)).toBe(true);
  });
  it.each([0, 3, 42, 605, 7.5])('rejects %d', (min) => {
    expect(isServiceDuration(min)).toBe(false);
  });
});

describe('isServiceBreak', () => {
  it.each([0, 5, 120])('accepts %d', (min) => {
    expect(isServiceBreak(min)).toBe(true);
  });
  it.each([-5, 3, 125])('rejects %d', (min) => {
    expect(isServiceBreak(min)).toBe(false);
  });
});

import { parsePhone } from './phone';

describe('parsePhone', () => {
  it.each([
    ['600 123 456', '+48600123456', '+48 600 123 456'],
    ['+48 600-123-456', '+48600123456', '+48 600 123 456'],
    ['0048600123456', '+48600123456', '+48 600 123 456'],
    ['12 345 67 89', '+48123456789', '+48 12 345 67 89'],
    ['+49 30 12345678', '+493012345678', '+49 30 12345678'],
  ])('%j → %s', (raw, e164, international) => {
    expect(parsePhone(raw)).toEqual({ e164, international });
  });

  it.each(['123', '600 123 45', 'abc', ''])('rejects %j', (raw) => {
    expect(parsePhone(raw)).toBeNull();
  });
});

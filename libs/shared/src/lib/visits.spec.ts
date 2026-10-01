import { visitStateLabel } from './visits';

describe('visitStateLabel', () => {
  const now = new Date('2026-10-05T12:00:00.000Z');

  it.each([
    ['SCHEDULED', '2026-10-05T12:30:00.000Z', 'Zaplanowana'],
    ['SCHEDULED', '2026-10-05T12:00:00.000Z', 'Odbyta'],
    ['SCHEDULED', '2026-10-04T09:00:00.000Z', 'Odbyta'],
    ['CANCELLED', '2026-10-04T09:00:00.000Z', 'Odwołana'],
    ['CANCELLED', '2026-10-06T09:00:00.000Z', 'Odwołana'],
    ['NO_SHOW', '2026-10-04T09:00:00.000Z', 'Nieodbyta'],
  ] as const)('%s at %s is %j', (state, startsAt, label) => {
    expect(visitStateLabel({ state, startsAt }, now)).toBe(label);
  });
});

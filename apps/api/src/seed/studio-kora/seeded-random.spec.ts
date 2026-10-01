import { seededRandom } from './seeded-random';

describe('seededRandom', () => {
  it('gives the same sequence for the same seed', () => {
    const a = seededRandom(37);
    const b = seededRandom(37);

    const draw = (random: ReturnType<typeof seededRandom>) =>
      Array.from({ length: 20 }, () => random.int(0, 1000));
    expect(draw(a)).toEqual(draw(b));
  });

  it('gives another sequence for another seed', () => {
    const draw = (seed: number) =>
      Array.from({ length: 20 }, () => seededRandom(seed).next());

    expect(draw(1)).not.toEqual(draw(2));
  });

  it('draws integers within both bounds', () => {
    const random = seededRandom(5);
    const values = new Set(Array.from({ length: 500 }, () => random.int(3, 6)));

    expect([...values].sort()).toEqual([3, 4, 5, 6]);
  });

  it('picks only items of the list', () => {
    const random = seededRandom(9);
    const items = ['a', 'b', 'c'];

    for (let i = 0; i < 50; i++) expect(items).toContain(random.pick(items));
  });
});

import {
  CollisionAbsence,
  CollisionVisit,
  findCollisions,
  visitInterval,
} from './find-collisions';

const ANNA = 'anna';
const EWA = 'ewa';
const at = (time: string) => new Date(`2026-10-05T${time}:00+02:00`);

function visit(
  fields: Partial<CollisionVisit> & Pick<CollisionVisit, 'startsAt'>,
): CollisionVisit {
  return {
    id: 'visit',
    staffMemberId: ANNA,
    durationMin: 60,
    breakMin: 0,
    state: 'SCHEDULED',
    label: 'Łucja Nowak',
    ...fields,
  };
}

function absence(
  fields: Partial<CollisionAbsence> &
    Pick<CollisionAbsence, 'startsAt' | 'endsAt'>,
): CollisionAbsence {
  return {
    id: 'absence',
    staffMemberId: ANNA,
    label: 'Urlop',
    ...fields,
  };
}

/** Anna, 10:00–11:00. */
const interval = {
  staffMemberId: ANNA,
  startsAt: at('10:00'),
  endsAt: at('11:00'),
};

describe('visitInterval', () => {
  it('ends after the Czas trwania and the Przerwa', () => {
    expect(
      visitInterval({
        staffMemberId: ANNA,
        startsAt: at('10:00'),
        durationMin: 45,
        breakMin: 15,
      }),
    ).toEqual(interval);
  });

  it('counts real minutes on the night the clocks go back', () => {
    const startsAt = new Date('2026-10-25T02:30:00+02:00');
    const { endsAt } = visitInterval({
      staffMemberId: ANNA,
      startsAt,
      durationMin: 60,
      breakMin: 0,
    });
    expect(endsAt.toISOString()).toBe('2026-10-25T01:30:00.000Z');
  });
});

describe('findCollisions', () => {
  it('finds nothing in an empty calendar', () => {
    expect(findCollisions(interval, [], [])).toEqual([]);
  });

  it('reports a Wizyta that overlaps, with the time it takes up', () => {
    const other = visit({
      id: 'v1',
      startsAt: at('10:30'),
      durationMin: 30,
      breakMin: 10,
    });

    expect(findCollisions(interval, [other], [])).toEqual([
      {
        type: 'visit',
        id: 'v1',
        startsAt: at('10:30'),
        endsAt: at('11:10'),
        label: 'Łucja Nowak',
      },
    ]);
  });

  it.each([
    ['ends when this one starts', at('09:00')],
    ['starts when this one ends', at('11:00')],
  ])('does not report a Wizyta that %s', (_, startsAt) => {
    expect(findCollisions(interval, [visit({ startsAt })], [])).toEqual([]);
  });

  it('counts the Przerwa of the other Wizyta', () => {
    const other = visit({
      startsAt: at('09:00'),
      durationMin: 50,
      breakMin: 15,
    });
    expect(findCollisions(interval, [other], [])).toHaveLength(1);
  });

  it('counts the Przerwa of this Wizyta', () => {
    const withBreak = visitInterval({
      staffMemberId: ANNA,
      startsAt: at('10:00'),
      durationMin: 60,
      breakMin: 15,
    });
    const other = visit({ startsAt: at('11:00') });
    expect(findCollisions(withBreak, [other], [])).toHaveLength(1);
  });

  it('reports a Wizyta that covers this one whole', () => {
    const other = visit({ startsAt: at('09:00'), durationMin: 180 });
    expect(findCollisions(interval, [other], [])).toHaveLength(1);
  });

  it.each(['CANCELLED', 'NO_SHOW'] as const)(
    'does not count a %s Wizyta',
    (state) => {
      const other = visit({ startsAt: at('10:00'), state });
      expect(findCollisions(interval, [other], [])).toEqual([]);
    },
  );

  it('does not count a Wizyta of another person', () => {
    const other = visit({ startsAt: at('10:00'), staffMemberId: EWA });
    expect(findCollisions(interval, [other], [])).toEqual([]);
  });

  it('reports a Nieobecność that overlaps', () => {
    const away = absence({
      id: 'a1',
      startsAt: at('10:45'),
      endsAt: at('18:00'),
    });

    expect(findCollisions(interval, [], [away])).toEqual([
      {
        type: 'absence',
        id: 'a1',
        startsAt: at('10:45'),
        endsAt: at('18:00'),
        label: 'Urlop',
      },
    ]);
  });

  it('does not report a Nieobecność that only touches this Wizyta', () => {
    const away = absence({ startsAt: at('11:00'), endsAt: at('12:00') });
    expect(findCollisions(interval, [], [away])).toEqual([]);
  });

  it('does not count a Nieobecność of another person', () => {
    const away = absence({
      staffMemberId: EWA,
      startsAt: at('08:00'),
      endsAt: at('18:00'),
    });
    expect(findCollisions(interval, [], [away])).toEqual([]);
  });

  it('lists Wizyty and Nieobecności by start', () => {
    const collisions = findCollisions(
      interval,
      [
        visit({ id: 'v2', startsAt: at('10:40') }),
        visit({ id: 'v1', startsAt: at('09:30') }),
      ],
      [absence({ id: 'a1', startsAt: at('10:15'), endsAt: at('10:30') })],
    );
    expect(collisions.map((c) => c.id)).toEqual(['v1', 'a1', 'v2']);
  });
});

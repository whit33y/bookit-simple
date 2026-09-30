import {
  describeVisitChange,
  VisitChangeView,
  VisitSnapshot,
} from './visit-changes';

const visit: VisitSnapshot = {
  staffMemberId: 'ewa',
  staffMemberName: 'Ewa',
  clientId: 'anna',
  clientName: 'Anna Nowak',
  // 14:00 in Warsaw (UTC+2).
  startsAt: '2026-10-05T12:00:00.000Z',
  durationMin: 60,
  breakMin: 0,
  description: null,
  state: 'SCHEDULED',
  services: [
    {
      serviceId: 's1',
      name: 'Strzyżenie damskie',
      priceGrosze: 8000,
      priceType: 'FIXED',
    },
  ],
};

const change = (
  fields: Pick<VisitChangeView, 'action' | 'before' | 'after'>,
): VisitChangeView => ({
  id: 'c1',
  visitId: 'v1',
  at: '2026-09-30T10:00:00.000Z',
  staffMemberId: 'kasia',
  staffMemberName: 'Kasia',
  ...fields,
});

describe('describeVisitChange', () => {
  it('describes a new Wizyta with its time and person', () => {
    expect(
      describeVisitChange(
        change({ action: 'CREATED', before: null, after: visit }),
      ),
    ).toEqual({
      summary: 'Nowa Wizyta: Anna Nowak',
      details: ['5.10.2026, 14:00, Ewa'],
    });
  });

  it('describes a move within the day as a Przesunięcie', () => {
    const after = { ...visit, startsAt: '2026-10-05T13:30:00.000Z' };
    expect(
      describeVisitChange(change({ action: 'UPDATED', before: visit, after })),
    ).toEqual({
      summary: 'Przesunięcie Wizyty: Anna Nowak',
      details: ['Godzina: 5.10.2026, 14:00 → 15:30'],
    });
  });

  it('shows both days for a move to another day', () => {
    const after = { ...visit, startsAt: '2026-10-06T08:00:00.000Z' };
    expect(
      describeVisitChange(change({ action: 'UPDATED', before: visit, after }))
        .details,
    ).toEqual(['Godzina: 5.10.2026, 14:00 → 6.10.2026, 10:00']);
  });

  it('lists every changed field of an edit', () => {
    const after: VisitSnapshot = {
      ...visit,
      staffMemberId: 'ola',
      staffMemberName: 'Ola',
      clientId: 'maria',
      clientName: 'Maria Kowalska',
      durationMin: 90,
      breakMin: 15,
      description: 'Grzywka',
      services: [
        ...visit.services,
        {
          serviceId: 's2',
          name: 'Modelowanie',
          priceGrosze: 5000,
          priceType: 'FROM',
        },
      ],
    };
    expect(
      describeVisitChange(change({ action: 'UPDATED', before: visit, after })),
    ).toEqual({
      summary: 'Zmiana Wizyty: Maria Kowalska',
      details: [
        'Osoba: Ewa → Ola',
        'Klient: Anna Nowak → Maria Kowalska',
        'Czas trwania: 60 → 90 min',
        'Przerwa: 0 → 15 min',
        'Usługi: Strzyżenie damskie → Strzyżenie damskie, Modelowanie',
        'Opis: brak → „Grzywka”',
      ],
    });
  });

  it('says so when an edit changed nothing', () => {
    expect(
      describeVisitChange(
        change({ action: 'UPDATED', before: visit, after: visit }),
      ).details,
    ).toEqual(['Bez zmian']);
  });

  it('writes "brak" for no Usługi', () => {
    const after = { ...visit, services: [], description: 'Konsultacja' };
    expect(
      describeVisitChange(change({ action: 'UPDATED', before: visit, after }))
        .details,
    ).toEqual([
      'Usługi: Strzyżenie damskie → brak',
      'Opis: brak → „Konsultacja”',
    ]);
  });

  it.each([
    ['CANCELLED', 'Odwołanie Wizyty: Anna Nowak'],
    ['NO_SHOW', 'Wizyta nieodbyta: Anna Nowak'],
    ['RESTORED', 'Przywrócenie Wizyty: Anna Nowak'],
  ] as const)('describes %s', (action, summary) => {
    expect(
      describeVisitChange(change({ action, before: visit, after: visit })),
    ).toEqual({ summary, details: ['5.10.2026, 14:00, Ewa'] });
  });

  it('describes a deletion from the Wizyta before it', () => {
    expect(
      describeVisitChange(
        change({ action: 'DELETED', before: visit, after: null }),
      ),
    ).toEqual({
      summary: 'Usunięcie Wizyty: Anna Nowak',
      details: ['5.10.2026, 14:00, Ewa'],
    });
  });
});

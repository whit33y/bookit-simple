import { polishHolidays } from './holidays';

const dateOf = (year: number, name: string) =>
  polishHolidays(year).find((holiday) => holiday.name === name)?.date;

describe('polishHolidays', () => {
  it.each([
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
    [2029, '2029-04-01'],
    [2030, '2030-04-21'],
  ])('Wielkanoc %i is on %s', (year, date) => {
    expect(dateOf(year, 'Wielkanoc')).toBe(date);
  });

  it('puts the holidays of 2026 on their days, in order', () => {
    expect(polishHolidays(2026)).toEqual([
      { date: '2026-01-01', name: 'Nowy Rok' },
      { date: '2026-01-06', name: 'Trzech Króli' },
      { date: '2026-04-05', name: 'Wielkanoc' },
      { date: '2026-04-06', name: 'Poniedziałek Wielkanocny' },
      { date: '2026-05-01', name: 'Święto Pracy' },
      { date: '2026-05-03', name: 'Święto Konstytucji 3 Maja' },
      { date: '2026-05-24', name: 'Zielone Świątki' },
      { date: '2026-06-04', name: 'Boże Ciało' },
      { date: '2026-08-15', name: 'Wniebowzięcie Najświętszej Maryi Panny' },
      { date: '2026-11-01', name: 'Wszystkich Świętych' },
      { date: '2026-11-11', name: 'Święto Niepodległości' },
      { date: '2026-12-24', name: 'Wigilia Bożego Narodzenia' },
      { date: '2026-12-25', name: 'Boże Narodzenie (pierwszy dzień)' },
      { date: '2026-12-26', name: 'Boże Narodzenie (drugi dzień)' },
    ]);
  });

  it('keeps a movable holiday in its order when it falls early', () => {
    // Wielkanoc 2027 is on 28 March, Boże Ciało on 27 May.
    const dates = polishHolidays(2027).map((holiday) => holiday.date);
    expect(dates).toEqual([...dates].sort());
    expect(dateOf(2027, 'Boże Ciało')).toBe('2027-05-27');
  });

  it('has Wigilia since 2025', () => {
    expect(dateOf(2025, 'Wigilia Bożego Narodzenia')).toBe('2025-12-24');
    expect(dateOf(2024, 'Wigilia Bożego Narodzenia')).toBeUndefined();
    expect(polishHolidays(2024)).toHaveLength(13);
  });
});

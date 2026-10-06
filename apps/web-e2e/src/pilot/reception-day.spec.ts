import { addDays, CalendarVisit } from '@bookit/shared';
import { Page } from '@playwright/test';
import { addAbsence } from '../support/absence-form';
import {
  clock,
  expect,
  logIn,
  nextWorkingDay,
  test,
  visitName,
} from '../support/studio-kora';

test.use({
  viewport: { width: 1280, height: 800 },
  timezoneId: 'Europe/Warsaw',
});
test.describe.configure({ timeout: 120_000 });

const MINUTE_MS = 60_000;

/** The empty field of `person` at the clock time `time`, e.g. "Kasia, 9:00". */
const slot = (page: Page, person: string, time: string) =>
  page.getByRole('button', { name: `${person}, ${time}`, exact: true });

/** The quarter `instant` is in, as its empty field is named: 9:55 is in "9:45". */
function quarterOf(instant: Date | string): string {
  const [hours, minutes] = clock(instant).split(':').map(Number);
  return `${hours}:${String(minutes - (minutes % 15)).padStart(2, '0')}`;
}

/** From the start to the end of the Przerwa, in ms, moved by `shiftMin`. */
const span = (v: CalendarVisit, shiftMin = 0) => {
  const start = new Date(v.startsAt).getTime() + shiftMin * MINUTE_MS;
  return [start, start + (v.durationMin + v.breakMin) * MINUTE_MS];
};

/**
 * A Wizyta of the day and how far later it goes into a gap, so it moves without a
 * Kolizja: the latest one long enough to take by its top (the lower edge of a short
 * one changes its Czas trwania instead), by 30 min to 2 h to stay on the screen.
 */
function gapFor(visits: CalendarVisit[]) {
  for (const visit of [...visits].reverse()) {
    if (visit.durationMin < 30) continue;
    for (let shiftMin = 30; shiftMin <= 120; shiftMin += 15) {
      const [start, end] = span(visit, shiftMin);
      const free = visits.every((other) => {
        if (other.id === visit.id) return true;
        const [from, to] = span(other);
        return end <= from || start >= to;
      });
      if (free) return { visit, shiftMin };
    }
  }
  throw new Error('No Wizyta can be moved into a gap');
}

async function pickService(page: Page, name: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Usługi' }).fill(name.slice(0, 5));
  await page.getByRole('option', { name: new RegExp(`^${name}`) }).click();
}

test('dzień recepcji: Kasia adds, moves, cancels a Wizyta, marks one not come and adds a Nieobecność', async ({
  page,
  studioKora,
}) => {
  const kora = await studioKora();
  await logIn(page, kora.emails.kasia);
  const { day, visits } = await nextWorkingDay(page.request, 'Kasia');
  await page.goto(`/panel/kalendarz?dzien=${day}`);
  await expect(page.locator('app-calendar-day-grid .name')).toHaveText([
    'Magda',
    'Kasia',
    'Ola',
    'Natalia',
  ]);

  // A new Klient on two Usługi before opening, when Kasia has nothing booked.
  await slot(page, 'Kasia', '7:30').click();
  const form = page.getByRole('dialog', { name: 'Nowa Wizyta' });
  await expect(form.getByLabel('Godzina')).toHaveValue('07:30');
  await page.getByRole('combobox', { name: 'Klient' }).fill('Zofia Pilotowa');
  await page.getByRole('option', { name: /Dodaj nowego Klienta/ }).click();
  const clientForm = page.getByRole('dialog', { name: 'Nowy Klient' });
  await clientForm.getByRole('button', { name: 'Zapisz' }).click();
  await expect(clientForm).toBeHidden();
  await pickService(page, 'Strzyżenie damskie');
  await pickService(page, 'Grzywka');
  await expect(form.getByLabel('Czas trwania (min)')).toHaveValue('55');
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(form).toBeHidden();
  await expect(
    page.getByRole('button', {
      name: '7:30–8:25, Zofia Pilotowa, Grzywka, Strzyżenie damskie',
    }),
  ).toBeVisible();

  // Another one is dragged later, into a gap.
  const { visit: moved, shiftMin } = gapFor(visits);
  const movedStart = new Date(span(moved, shiftMin)[0]).toISOString();
  const movedVisit = page.getByRole('button', { name: visitName(moved) });
  await movedVisit.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const [box, from, to] = await Promise.all([
    movedVisit.boundingBox(),
    slot(page, 'Kasia', quarterOf(moved.startsAt)).boundingBox(),
    slot(page, 'Kasia', quarterOf(movedStart)).boundingBox(),
  ]);
  if (!box || !from || !to) throw new Error('The grid is not drawn');
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/visits/${moved.id}`) &&
      r.request().method() === 'PATCH',
  );
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(x, box.y + 5 + to.y - from.y, { steps: 20 });
  await page.mouse.up();
  const response = await saved;
  expect(response.request().postDataJSON()).toEqual({ startsAt: movedStart });
  expect(response.status()).toBe(200);
  await expect(movedVisit).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: visitName({ ...moved, startsAt: movedStart }),
    }),
  ).toBeVisible();

  // Two more of her Wizyty: one is cancelled, the Klient of the other does not come.
  // Not the seed's Kolizja, whose blocks share a start and overlap in the grid.
  const alone = (visit: CalendarVisit) => {
    const [start, end] = span(visit);
    return visits.every((other) => {
      if (other.id === visit.id) return true;
      const [from, to] = span(other);
      return end <= from || start >= to;
    });
  };
  const [cancelled, missed] = visits.filter(
    (v) => v.id !== moved.id && alone(v),
  );
  // A 10-minute Wizyta has its resize handle over the centre. Open its body above it.
  await page.getByRole('button', { name: visitName(cancelled) }).click({
    position: { x: 6, y: 3 },
  });
  const card = page.getByRole('dialog', { name: cancelled.client.name });
  await card.getByRole('button', { name: 'Odwołaj' }).click();
  await expect(card.locator('.state')).toHaveText('Odwołana');
  await card.getByRole('button', { name: 'Zamknij' }).click();
  await expect(card).toBeHidden();
  await expect(
    page.getByRole('button', { name: visitName(cancelled) }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: visitName(missed) }).click({
    position: { x: 6, y: 3 },
  });
  const missedCard = page.getByRole('dialog', { name: missed.client.name });
  await missedCard.getByRole('button', { name: 'Nie przyszedł' }).click();
  await expect(missedCard.locator('.state')).toHaveText('Nieodbyta');
  await missedCard.getByRole('button', { name: 'Zamknij' }).click();
  await expect(missedCard).toBeHidden();
  await expect(
    page.getByRole('button', { name: visitName(missed) }),
  ).toHaveAccessibleName(/, Nieodbyta$/);

  // The day after, Kasia is off.
  const dayOff = addDays(day, 1);
  await page.getByRole('link', { name: 'Następny dzień' }).click();
  await expect(page).toHaveURL(`/panel/kalendarz?dzien=${dayOff}`);
  await addAbsence(page, {
    person: 'Kasia',
    from: dayOff,
    to: dayOff,
    reason: 'Urlop',
  });
  await expect(
    page.getByRole('button', { name: 'Nieobecność, Kasia, Urlop' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Nieobecność, Kasia, Urlop' }),
  ).toBeVisible();
});

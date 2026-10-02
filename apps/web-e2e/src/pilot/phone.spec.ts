import { Page } from '@playwright/test';
import { expect, logIn, nextWorkingDay, test } from '../support/studio-kora';
import { swipe } from '../support/swipe';

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  timezoneId: 'Europe/Warsaw',
});
test.describe.configure({ timeout: 120_000 });

/** The name in the head of the only column. */
const shownPerson = (page: Page) => page.locator('app-calendar-day-grid .name');

test('telefon: Ola swipes through the Personel and adds a Wizyta with "+"', async ({
  page,
  studioKora,
}) => {
  const kora = await studioKora();
  await logIn(page, kora.emails.ola);
  const { day } = await nextWorkingDay(page.request, 'Ola');
  await page.goto(`/panel/kalendarz?dzien=${day}`);

  // The phone shows one person at a time, in the order of the Personel.
  await expect(shownPerson(page)).toHaveText('Magda');
  await swipe(page, -200);
  await expect(shownPerson(page)).toHaveText('Kasia');
  await swipe(page, -200);
  await expect(shownPerson(page)).toHaveText('Ola');
  await swipe(page, -200);
  await expect(shownPerson(page)).toHaveText('Natalia');
  await swipe(page, 200);
  await expect(shownPerson(page)).toHaveText('Ola');

  // In the evening, after closing, Ola has nothing booked.
  await page.getByRole('button', { name: 'Nowa Wizyta' }).click();
  const form = page.getByRole('dialog', { name: 'Nowa Wizyta' });
  await expect(form.getByRole('combobox', { name: 'Osoba' })).toHaveText('Ola');
  await expect(form.getByLabel('Data')).toHaveValue(day);
  await page.getByRole('combobox', { name: 'Klient' }).fill('Hanna Telefon');
  await page.getByRole('option', { name: /Dodaj nowego Klienta/ }).click();
  const clientForm = page.getByRole('dialog', { name: 'Nowy Klient' });
  await clientForm.getByLabel('Telefon').fill('601 234 567');
  await clientForm.getByRole('button', { name: 'Zapisz' }).click();
  await expect(clientForm).toBeHidden();
  await form.getByLabel('Godzina').fill('19:15');
  await page.getByRole('combobox', { name: 'Usługi' }).fill('Manic');
  await page.getByRole('option', { name: /^Manicure hybrydowy/ }).click();
  await expect(form.getByLabel('Czas trwania (min)')).toHaveValue('75');
  const save = form.getByRole('button', { name: 'Zapisz' });
  await expect(save).toBeInViewport();
  await save.click();
  await expect(form).toBeHidden();

  const visit = page.getByRole('button', {
    name: '19:15–20:30, Hanna Telefon, Manicure hybrydowy',
  });
  await expect(visit).toBeAttached();
  await expect(shownPerson(page)).toHaveText('Ola');
  await page.reload();
  await expect(shownPerson(page)).toHaveText('Ola');
  await expect(visit).toBeAttached();
});

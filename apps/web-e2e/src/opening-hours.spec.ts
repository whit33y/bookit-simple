import { expect, test } from '@playwright/test';
import { loggedInOwner } from './support/invited-owner';

test('the Właściciel sets the Godziny otwarcia, and they stay after a reload', async ({
  page,
}) => {
  await loggedInOwner(page.request);

  await page.goto('/panel/ustawienia');
  await page
    .getByRole('tablist', { name: 'Ustawienia' })
    .getByRole('tab', { name: 'Godziny otwarcia' })
    .click();
  await expect(page).toHaveURL('/panel/ustawienia/godziny');
  await expect(
    page.getByRole('heading', { name: 'Godziny otwarcia' }),
  ).toBeVisible();

  const open = (day: string) =>
    page.getByRole('switch', { name: `${day}: otwarte` });
  const from = (day: string) => page.getByLabel(`${day}: od`);
  const to = (day: string) => page.getByLabel(`${day}: do`);

  await open('Poniedziałek').click();
  await from('Poniedziałek').fill('09:00');
  await to('Poniedziałek').fill('19:00');
  await page.getByRole('button', { name: 'Skopiuj na dni robocze' }).click();
  await open('Sobota').click();
  await from('Sobota').fill('09:00');
  await to('Sobota').fill('08:00');

  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(
    page.getByRole('listitem', { name: 'Sobota' }).getByRole('alert'),
  ).toHaveText('Godzina zamknięcia musi być późniejsza niż otwarcia');

  await to('Sobota').fill('15:00');
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/opening-hours') && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Zapisz' }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole('status')).toHaveText(
    'Zapisano Godziny otwarcia',
  );

  await page.reload();
  for (const day of ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek']) {
    await expect(open(day)).toBeChecked();
    await expect(from(day)).toHaveValue('09:00');
    await expect(to(day)).toHaveValue('19:00');
  }
  await expect(to('Sobota')).toHaveValue('15:00');
  await expect(open('Niedziela')).not.toBeChecked();
});

import { expect, test } from '@playwright/test';
import { loggedInOwner } from './support/invited-owner';

test('the Właściciel adds Klienci, finds one without Polish marks, confirms a taken phone and deletes', async ({
  page,
}) => {
  await loggedInOwner(page.request);

  await page.goto('/panel');
  await page.getByRole('link', { name: 'Klienci' }).click();
  await expect(page).toHaveURL('/panel/klienci');
  await expect(
    page.getByText('Kartoteka jest pusta. Dodaj pierwszego Klienta.'),
  ).toBeVisible();

  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Dodaj Klienta' }).click();
  await expect(
    dialog.getByText(
      'Nie wpisuj tu informacji o zdrowiu (alergie, choroby, leki)',
    ),
  ).toBeVisible();
  await dialog.getByLabel('Imię').fill('Łucja Kowalska');
  await dialog.getByLabel('Telefon').fill('0048 600-100-200');
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(dialog).toBeHidden();
  const row = (name: string) => page.getByRole('listitem', { name });
  await expect(row('Łucja Kowalska')).toContainText('+48 600 100 200');

  await page.getByRole('button', { name: 'Dodaj Klienta' }).click();
  await dialog.getByLabel('Imię').fill('Ola');
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Dodaj Klienta' }).click();
  await dialog.getByLabel('Imię').fill('Łucja córka');
  await dialog.getByLabel('Telefon').fill('600 100 200');
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Ten numer ma już inny Klient',
  );
  await expect(dialog.getByRole('alert')).toContainText('Łucja Kowalska');
  await dialog.getByRole('button', { name: 'Zapisz mimo to' }).click();
  await expect(dialog).toBeHidden();

  const search = page.getByLabel('Szukaj po imieniu lub telefonie');
  await search.fill('lucja');
  const names = page
    .getByRole('list', { name: 'Klienci' })
    .getByRole('listitem');
  await expect(names).toHaveCount(2);
  await search.fill('600100');
  await expect(names).toHaveCount(2);
  await search.fill('ola');
  await expect(names).toHaveCount(1);

  await page.getByRole('button', { name: 'Usuń: Ola' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Usuń' }).click();
  await expect(page.getByText('Nikt nie pasuje do „ola”.')).toBeVisible();
});

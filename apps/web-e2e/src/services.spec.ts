import { expect, test } from '@playwright/test';
import { loggedInOwner } from './support/invited-owner';

test('the Właściciel adds a Usługa to the Cennik, archives it and brings it back, and the Wizytówka follows', async ({
  page,
}) => {
  const owner = await loggedInOwner(page.request);
  const categories = await page.request.post('/api/service-categories', {
    data: { name: 'Strzyżenie' },
  });
  expect(categories.status()).toBe(201);

  await page.goto('/panel/ustawienia/cennik');
  const category = page.getByRole('region', { name: 'Strzyżenie' });
  await expect(category).toContainText('Nie ma jeszcze Usług');

  await category
    .getByRole('button', { name: 'Dodaj Usługę do: Strzyżenie' })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nazwa').fill('Strzyżenie damskie');
  await dialog.getByLabel('Cena', { exact: true }).fill('79,50');
  await dialog.getByRole('radio', { name: 'Od' }).click();
  await dialog.getByLabel('Czas trwania').fill('45');
  await dialog.getByLabel('Przerwa po Wizycie').fill('10');
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(dialog).toBeHidden();

  const row = category.getByRole('listitem').filter({
    hasText: 'Strzyżenie damskie',
  });
  await expect(row).toContainText('od 79,50 zł · 45 min + 10 min Przerwy');
  // The Wizytówka may be cached for a minute; a new query string skips the cache.
  let reads = 0;
  const wizytowka = async () => {
    const res = await page.request.get(
      `/api/public/pages/${owner.slug}?read=${++reads}`,
    );
    return (await res.json()).categories;
  };
  expect(await wizytowka()).toEqual([
    {
      name: 'Strzyżenie',
      services: [
        expect.objectContaining({
          name: 'Strzyżenie damskie',
          priceGrosze: 7950,
          priceType: 'FROM',
        }),
      ],
    },
  ]);

  await page
    .getByRole('button', { name: 'Archiwizuj: Strzyżenie damskie' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Archiwizuj' })
    .click();
  // An open dialog hides the page from roles, so wait for it before looking at the row.
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(row).toBeHidden();
  expect(await wizytowka()).toEqual([]);

  await page.getByText('Pokaż zarchiwizowane').click();
  await page
    .getByRole('button', { name: 'Przywróć: Strzyżenie damskie' })
    .click();
  await expect(row).toContainText('od 79,50 zł');
  await expect(row).not.toContainText('Zarchiwizowana');
  await page.reload();
  await expect(row).toBeVisible();
});

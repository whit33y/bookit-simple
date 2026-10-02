import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { loggedInOwner } from './support/invited-owner';

const LOGO = resolve(__dirname, '../../api/test/fixtures/transparent.png');

test('the Właściciel sets the colour, logo and map link of the Wizytówka', async ({
  page,
}) => {
  const owner = await loggedInOwner(page.request);
  /** Waits out the slide, which briefly shows two tabs and loses what is typed. */
  const openTab = async (name: string) => {
    await page.getByRole('tab', { name }).click();
    await expect(page.locator('.mat-tab-body-animating')).toHaveCount(0);
  };

  await page.goto('/panel/ustawienia');
  await page
    .getByRole('tablist', { name: 'Ustawienia' })
    .getByRole('tab', { name: 'Wizytówka' })
    .click();
  await expect(page).toHaveURL('/panel/ustawienia/wizytowka');
  await expect(
    page.getByRole('link', { name: 'Otwórz Wizytówkę' }),
  ).toHaveAttribute('href', `/${owner.slug}`);

  // A new Salon has the privacy notice filled from the template.
  await openTab('Prywatność');
  await expect(page.getByLabel('Klauzula informacyjna')).toHaveValue(
    new RegExp(
      `^Administratorem Twoich danych osobowych jest ${owner.salonName}`,
    ),
  );

  await openTab('Dane');
  await page.getByLabel('Link do mapy').fill('javascript:alert(1)');
  await openTab('Wygląd');
  await page.getByLabel('Kolor akcentu').fill('#C0392B');
  const uploaded = page.waitForResponse(
    (r) => r.url().endsWith('/api/photos') && r.request().method() === 'POST',
  );
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dodaj logo' }).click();
  await (await chooser).setFiles(LOGO);
  const logo = (await (await uploaded).json()) as { id: string };

  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('tab', { name: 'Dane' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByText('Link do mapy musi zaczynać się od https://'),
  ).toBeVisible();

  await page.getByLabel('Link do mapy').fill('https://maps.app.goo.gl/abc123');
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/salon/page') && r.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Zapisz' }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole('status')).toHaveText('Zapisano Wizytówkę');

  await page.reload();
  await expect(page.getByLabel('Link do mapy')).toHaveValue(
    'https://maps.app.goo.gl/abc123',
  );
  await openTab('Wygląd');
  await expect(page.getByLabel('Kolor akcentu')).toHaveValue('#c0392b');
  await expect(page.getByRole('img', { name: 'Dodaj logo' })).toHaveAttribute(
    'src',
    `/api/public/photos/${logo.id}`,
  );

  const wizytowka = await page.request.get(`/api/public/pages/${owner.slug}`);
  expect(await wizytowka.json()).toMatchObject({
    salon: {
      accentColor: '#c0392b',
      logo: expect.objectContaining({ id: logo.id }),
      mapUrl: 'https://maps.app.goo.gl/abc123',
    },
  });
});

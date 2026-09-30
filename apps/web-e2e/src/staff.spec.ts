import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { loggedInOwner, PASSWORD } from './support/invited-owner';
import { linkSentTo } from './support/mailpit';

test('the Właściciel invites a Pracownik, who accepts the invitation and does not see the settings', async ({
  page,
  browser,
}) => {
  const owner = await loggedInOwner(page.request);
  const email = `pracownik-${randomUUID().slice(0, 8)}@bookit.test`;

  await page.goto('/panel');
  await page
    .getByRole('navigation', { name: 'Menu boczne' })
    .getByRole('link', { name: 'Ustawienia' })
    .click();
  await expect(page).toHaveURL('/panel/ustawienia/personel');
  await expect(page.getByRole('heading', { name: 'Personel' })).toBeVisible();

  await page.getByLabel('Imię').fill('Kasia');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Zaproś' }).click();

  await expect(page.getByRole('status')).toHaveText(
    `Zaproszenie poszło na ${email}.`,
  );
  const row = page.getByRole('listitem').filter({ hasText: 'Kasia' });
  await expect(row).toContainText('Pracownik');
  await expect(row).toContainText('Oczekuje');

  // The Pracownik, in a browser of their own.
  const employee = await (await browser.newContext()).newPage();
  await employee.goto(await linkSentTo(email, 'zaproszenie'));
  await expect(
    employee.getByRole('heading', { name: owner.salonName }),
  ).toBeVisible();
  await employee.getByLabel('Nowe hasło').fill(PASSWORD);
  await employee.getByLabel('Powtórz hasło').fill(PASSWORD);
  await employee.getByRole('button', { name: 'Ustaw hasło' }).click();

  await expect(employee).toHaveURL('/panel');
  const menu = employee.getByRole('navigation', { name: 'Menu boczne' });
  await expect(menu.getByRole('link', { name: 'Kalendarz' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Ustawienia' })).toHaveCount(0);
  await employee.goto('/panel/ustawienia/personel');
  await expect(employee).toHaveURL('/panel');

  await page.reload();
  await expect(row).toContainText('Przyjęte');
});

import { expect, Page, test } from '@playwright/test';
import {
  invitedOwner,
  loggedInOwner,
  PASSWORD,
} from './support/invited-owner';
import { linkSentTo } from './support/mailpit';

async function logIn(page: Page, email: string, password: string) {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Hasło', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
}

test('an invited person sets a password, lands in the panel, logs out and logs in again', async ({
  page,
}) => {
  const owner = invitedOwner();
  await page.goto(await linkSentTo(owner.email, 'zaproszenie'));

  await expect(
    page.getByRole('heading', { name: owner.salonName }),
  ).toBeVisible();
  await page.getByLabel('Nowe hasło').fill(PASSWORD);
  await page.getByLabel('Powtórz hasło').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ustaw hasło' }).click();

  await expect(page).toHaveURL('/panel');
  await expect(page.getByRole('heading', { name: 'Kalendarz' })).toBeVisible();

  await page.getByRole('button', { name: 'Konto' }).click();
  await page.getByRole('menuitem', { name: 'Wyloguj się' }).click();
  await expect(page).toHaveURL('/logowanie');

  await logIn(page, owner.email, PASSWORD);
  await expect(page).toHaveURL('/panel');
  await expect(page.getByText(owner.salonName)).toBeVisible();
});

test('the invitation link works only once', async ({ page }) => {
  const owner = invitedOwner();
  const link = await linkSentTo(owner.email, 'zaproszenie');
  const token = link.split('/').at(-1);
  await page.request.post('/api/auth/accept-invitation', {
    data: { token, password: PASSWORD },
  });
  await page.context().clearCookies();

  await page.goto(link);
  await expect(page.getByRole('alert')).toHaveText(
    'Zaproszenie wygasło albo zostało już użyte',
  );
});

test('resets the password through the link from Mailpit', async ({ page }) => {
  const owner = await loggedInOwner(page.request);
  await page.context().clearCookies();
  const newPassword = 'zupelnie-nowe-haslo';

  await page.goto('/logowanie');
  await page.getByRole('link', { name: 'Nie pamiętasz hasła?' }).click();
  await expect(page).toHaveURL('/reset-hasla');
  await page.getByLabel('E-mail').fill(owner.email);
  await page.getByRole('button', { name: 'Wyślij link' }).click();
  await expect(page.getByRole('status')).toContainText(owner.email);

  await page.goto(await linkSentTo(owner.email, 'reset-hasla'));
  await page.getByLabel('Nowe hasło').fill(newPassword);
  await page.getByLabel('Powtórz hasło').fill(newPassword);
  await page.getByRole('button', { name: 'Zapisz hasło' }).click();

  await expect(page).toHaveURL('/logowanie?reset=ok');
  await expect(page.getByRole('status')).toHaveText(
    'Hasło zostało zmienione. Zaloguj się nowym hasłem.',
  );

  await logIn(page, owner.email, PASSWORD);
  await expect(page.getByRole('alert')).toHaveText(
    'Nieprawidłowy e-mail lub hasło',
  );

  await logIn(page, owner.email, newPassword);
  await expect(page).toHaveURL('/panel');
});

test('entering /panel without a session redirects to /logowanie', async ({
  page,
}) => {
  await page.goto('/panel');
  await expect(page).toHaveURL('/logowanie');
  await expect(
    page.getByRole('button', { name: 'Zaloguj się' }),
  ).toBeVisible();
});

test.describe('panel navigation', () => {
  const sideMenu = (page: Page) =>
    page.getByRole('navigation', { name: 'Menu boczne' });
  const bottomNav = (page: Page) =>
    page.getByRole('navigation', { name: 'Nawigacja dolna' });

  test('on a phone (390×844) shows the bottom navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loggedInOwner(page.request);
    await page.goto('/panel');

    await expect(bottomNav(page)).toBeVisible();
    await expect(sideMenu(page)).toBeHidden();
    await bottomNav(page).getByRole('link', { name: 'Klienci' }).click();
    await expect(page).toHaveURL('/panel/klienci');
  });

  test('on a desktop (1280×800) shows the side menu', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loggedInOwner(page.request);
    await page.goto('/panel');

    await expect(sideMenu(page)).toBeVisible();
    await expect(bottomNav(page)).toBeHidden();
    await sideMenu(page).getByRole('link', { name: 'Ustawienia' }).click();
    await expect(page).toHaveURL('/panel/ustawienia');
  });
});

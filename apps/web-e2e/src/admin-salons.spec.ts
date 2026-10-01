import { expect, Page, test } from '@playwright/test';
import {
  ADMINISTRATOR,
  invitedOwner,
  loggedInOwner,
  newSalonData,
  PASSWORD,
} from './support/invited-owner';
import { BASE_URL } from './support/base-url';
import { linkSentTo } from './support/mailpit';

async function logInAsAdministrator(page: Page) {
  await page.goto('/logowanie');
  await page.getByLabel('E-mail').fill(ADMINISTRATOR.email);
  await page.getByLabel('Hasło', { exact: true }).fill(ADMINISTRATOR.password);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page).toHaveURL('/admin');
}

const summary = (page: Page) =>
  page.getByRole('complementary', { name: 'Podsumowanie' });

test('the Administrator creates a Salon, and its Właściciel accepts the invitation and sees an empty panel', async ({
  page,
  browser,
}) => {
  const salon = newSalonData();
  await logInAsAdministrator(page);

  await page.getByRole('link', { name: 'Nowy Salon' }).click();
  await expect(page).toHaveURL('/admin/salony/nowy');
  await page.getByLabel('Nazwa Salonu').fill(salon.salonName);
  await expect(page.getByLabel('Adres wizytówki')).toHaveValue(salon.slug);
  await expect(summary(page).getByRole('status')).toContainText('Adres wolny');
  await expect(summary(page)).toContainText(
    `${new URL(page.url()).origin}/${salon.slug}`,
  );
  await page.getByLabel('Telefon').fill('600 123 456');
  await expect(summary(page)).toContainText('+48 600 123 456');
  await page.getByLabel('Imię i nazwisko').fill(salon.ownerName);
  await page.getByLabel('E-mail Właściciela').fill(salon.email);
  await page.getByRole('button', { name: 'Załóż Salon' }).click();

  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('status')).toHaveText(
    `Salon ${salon.salonName} został założony. Zaproszenie poszło na ${salon.email}.`,
  );

  // The Właściciel, in a browser of their own.
  const owner = await (await browser.newContext()).newPage();
  await owner.goto(await linkSentTo(salon.email, 'zaproszenie'));
  await expect(
    owner.getByRole('heading', { name: salon.salonName }),
  ).toBeVisible();
  await owner.getByLabel('Nowe hasło').fill(PASSWORD);
  await owner.getByLabel('Powtórz hasło').fill(PASSWORD);
  await owner.getByRole('button', { name: 'Ustaw hasło' }).click();

  await expect(owner).toHaveURL('/panel/kalendarz');
  await expect(owner).toHaveTitle('Kalendarz · Bookit');
  await expect(owner.getByText(salon.salonName)).toBeVisible();
});

test('the form rejects a reserved and a taken Adres wizytówki', async ({
  page,
}) => {
  await logInAsAdministrator(page);
  await page.goto('/admin/salony/nowy');
  const slug = page.getByLabel('Adres wizytówki');

  await slug.fill('admin');
  await expect(
    page.getByText('Ten adres jest zarezerwowany').first(),
  ).toBeVisible();

  await page.getByLabel('Nazwa Salonu').fill('Nowa nazwa');
  await expect(slug).toHaveValue('admin');

  const salon = newSalonData();
  await slug.fill('');
  await page.getByLabel('Nazwa Salonu').fill(salon.salonName);
  await expect(slug).toHaveValue(salon.slug);
  await page.getByLabel('Imię i nazwisko').fill(salon.ownerName);
  await page.getByLabel('E-mail Właściciela').fill(salon.email);
  await expect(summary(page).getByRole('status')).toContainText('Adres wolny');
  await page.getByRole('button', { name: 'Załóż Salon' }).click();
  await expect(page).toHaveURL('/admin');

  await page.goto('/admin/salony/nowy');
  await page.getByLabel('Nazwa Salonu').fill(salon.salonName);
  await expect(summary(page).getByRole('status')).toContainText(
    'Ten adres jest już zajęty',
  );
});

test('suspending a Salon logs its Personel out until the Administrator resumes it', async ({
  page,
  browser,
}) => {
  const ownerPage = await (await browser.newContext()).newPage();
  const owner = await loggedInOwner(ownerPage.request);
  await ownerPage.goto('/panel');
  await expect(ownerPage).toHaveTitle('Kalendarz · Bookit');

  await logInAsAdministrator(page);
  await page.getByLabel('Szukaj po nazwie').fill(owner.salonName);
  await page.getByRole('link', { name: owner.salonName }).click();
  await expect(
    page.getByRole('heading', { name: owner.salonName }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Zawieś Salon' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`Zawiesić Salon ${owner.salonName}?`);
  await dialog.getByRole('button', { name: 'Zawieś Salon' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Personel został wylogowany',
  );

  await ownerPage.reload();
  await expect(ownerPage).toHaveURL('/logowanie');
  const logIn = async () => {
    await ownerPage.getByLabel('E-mail').fill(owner.email);
    await ownerPage.getByLabel('Hasło', { exact: true }).fill(PASSWORD);
    await ownerPage.getByRole('button', { name: 'Zaloguj się' }).click();
  };
  await logIn();
  await expect(ownerPage.getByRole('alert')).toHaveText(
    'Salon jest zawieszony',
  );

  await page.getByRole('button', { name: 'Odwieś Salon' }).click();
  await expect(page.getByRole('status')).toContainText('znów aktywny');

  await logIn();
  await expect(ownerPage).toHaveURL('/panel/kalendarz');
});

test('changing the Adres wizytówki warns about the redirect, and the old address answers 301', async ({
  page,
}) => {
  const owner = await invitedOwner();
  const moved = `${owner.slug}-nowy`;
  await logInAsAdministrator(page);
  await page.getByLabel('Szukaj po nazwie').fill(owner.salonName);
  await page.getByRole('link', { name: owner.salonName }).click();

  const field = page.getByRole('textbox', { name: 'Adres wizytówki' });
  await expect(field).toHaveValue(owner.slug);
  await field.fill(moved);
  await expect(page.getByRole('note')).toContainText(
    `Linki do ${BASE_URL}/${owner.slug} będą przekierowywane`,
  );
  await page.getByRole('button', { name: 'Zmień adres' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Stary adres przekierowuje na nowy',
  );
  await expect(page.getByText(`${BASE_URL}/${moved}`).first()).toBeVisible();

  for (const [from, to] of [
    [`/${owner.slug}`, `/${moved}`],
    [`/${owner.slug}/prywatnosc`, `/${moved}/prywatnosc`],
  ]) {
    const res = await page.request.head(from, { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()['location']).toBe(to);
  }
});

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

test('section order stays a draft until saved and is rendered in SSR', async ({
  page,
}) => {
  const owner = await loggedInOwner(page.request);
  await page.request.patch('/api/salon/page', {
    data: { about: 'Treść O nas', phone: '600123456' },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/panel/ustawienia/wizytowka');
  await page.getByRole('tab', { name: 'Sekcje', exact: true }).click();
  await expect(page.locator('.mat-tab-body-animating')).toHaveCount(0);
  const rows = page.locator('.sections li');
  await expect(rows).toHaveCount(7);
  await expect(
    page.getByRole('button', { name: 'W górę: Ogłoszenia', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'W dół: Kontakt', exact: true }),
  ).toBeDisabled();
  const aboutUp = page.getByRole('button', {
    name: 'W górę: O nas',
    exact: true,
  });
  await aboutUp.focus();
  await page.keyboard.press('Enter');
  await expect(rows.first()).toContainText('O nas');
  // Clicking a visibility switch leaves the section in place.
  await page.getByRole('switch', { name: 'O nas', exact: true }).click();
  await expect(rows.first()).toContainText('O nas');
  await page.getByRole('switch', { name: 'O nas', exact: true }).click();
  // CDK drag is initiated only from the handle, using the same list as the buttons.
  const handle = rows.first().locator('.drag-handle');
  const start = await handle.boundingBox();
  const target = await rows.nth(2).boundingBox();
  if (!start || !target) throw new Error('Missing drag coordinates');
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    start.x + start.width / 2,
    start.y + start.height / 2 + 8,
    { steps: 3 },
  );
  await page.mouse.move(
    start.x + start.width / 2,
    target.y + target.height / 2,
    { steps: 20 },
  );
  await page.mouse.up();
  await expect(rows.nth(2)).toContainText('O nas');
  for (let i = 0; i < 6; i++) {
    await page
      .getByRole('button', { name: 'W górę: Kontakt', exact: true })
      .press('Enter');
    await expect(rows.nth(5 - i)).toContainText('Kontakt');
  }
  await expect(rows.first()).toContainText('Kontakt');
  const original = [
    'announcements',
    'about',
    'pricing',
    'team',
    'gallery',
    'hours',
    'contact',
  ];
  expect(
    (await (await page.request.get(`/api/public/pages/${owner.slug}`)).json())
      .sectionOrder,
  ).toEqual(original);
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/salon/page') && r.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Zapisz', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await page.getByRole('tab', { name: 'Sekcje', exact: true }).click();
  await expect(rows.nth(3)).toContainText('O nas');
  const html = await (await page.request.get(`/${owner.slug}`)).text();
  const headings = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map(
    (match) => match[1],
  );
  expect(headings).toContain('O nas');
  expect(headings[0]).toBe('Kontakt');
  expect(headings.indexOf('Kontakt')).toBeLessThan(headings.indexOf('O nas'));
  const publicPage = await (
    await page.request.get(`/api/public/pages/${owner.slug}`)
  ).json();
  expect(publicPage.sectionOrder).toEqual([
    'contact',
    'announcements',
    'pricing',
    'about',
    'team',
    'gallery',
    'hours',
  ]);
});

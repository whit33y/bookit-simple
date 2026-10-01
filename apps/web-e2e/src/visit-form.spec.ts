import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { loggedInOwner } from './support/invited-owner';

// A Thursday; 10:00 in Warsaw is 09:00Z.
const DAY = '2026-11-12';

/** A Kategoria with Usługi of these Czasy trwania (and Przerwy), named in the order given. */
async function addServices(
  request: APIRequestContext,
  services: { name: string; durationMin: number; breakMin?: number }[],
): Promise<void> {
  const category = await request.post('/api/service-categories', {
    data: { name: 'Fryzjer' },
  });
  expect(category.status()).toBe(201);
  const { id: categoryId } = (await category.json()) as { id: string };
  for (const service of services) {
    const created = await request.post('/api/services', {
      data: { categoryId, priceGrosze: 10000, priceType: 'FIXED', ...service },
    });
    expect(created.status()).toBe(201);
  }
}

async function addClient(
  request: APIRequestContext,
  name: string,
): Promise<string> {
  const created = await request.post('/api/clients', { data: { name } });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

async function pickService(page: Page, name: string): Promise<void> {
  const input = page.getByRole('combobox', { name: 'Usługi' });
  await input.fill(name.slice(0, 4));
  await page.getByRole('option', { name: new RegExp(name) }).click();
}

async function pickClient(page: Page, name: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Klient' }).fill(name);
  await page
    .getByRole('option', { name: new RegExp(name) })
    .first()
    .click();
}

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Usługi suggest the Czas trwania until it is typed by hand', async ({
    page,
  }) => {
    await loggedInOwner(page.request);
    await addServices(page.request, [
      { name: 'Strzyżenie damskie', durationMin: 30, breakMin: 5 },
      { name: 'Koloryzacja', durationMin: 45, breakMin: 15 },
      { name: 'Modelowanie', durationMin: 20 },
    ]);

    await page.goto(`/panel/kalendarz?dzien=${DAY}`);
    await page.getByRole('button', { name: 'Ewa, 10:00' }).click();
    const form = page.getByRole('dialog', { name: 'Nowa Wizyta' });
    await expect(form.getByLabel('Godzina')).toHaveValue('10:00');

    // A new Klient is added without leaving the form.
    await page.getByRole('combobox', { name: 'Klient' }).fill('Anna Testowa');
    await page.getByRole('option', { name: /Dodaj nowego Klienta/ }).click();
    const clientForm = page.getByRole('dialog', { name: 'Nowy Klient' });
    await expect(clientForm.getByLabel('Imię')).toHaveValue('Anna Testowa');
    await clientForm.getByRole('button', { name: 'Zapisz' }).click();
    await expect(clientForm).toBeHidden();
    await expect(form.getByRole('combobox', { name: 'Klient' })).toHaveValue(
      'Anna Testowa',
    );

    const duration = form.getByLabel('Czas trwania (min)');
    const pause = form.getByLabel('Przerwa (min)');
    await pickService(page, 'Strzyżenie damskie');
    await pickService(page, 'Koloryzacja');
    await expect(duration).toHaveValue('75');
    await expect(pause).toHaveValue('15');

    await duration.fill('90');
    await pickService(page, 'Modelowanie');
    await expect(duration).toHaveValue('90');

    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/visits') && r.request().method() === 'POST',
    );
    await form.getByRole('button', { name: 'Zapisz' }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({
      startsAt: `${DAY}T09:00:00.000Z`,
      durationMin: 90,
      breakMin: 15,
    });
    await expect(form).toBeHidden();
    await expect(
      page.getByRole('button', { name: /10:00–11:30, Anna Testowa/ }),
    ).toBeVisible();
  });

  test('a Wizyta is saved despite a Kolizja', async ({ page }) => {
    await loggedInOwner(page.request);
    const clientId = await addClient(page.request, 'Basia Kolizja');
    const staff = (await (await page.request.get('/api/staff')).json()) as {
      id: string;
    }[];
    const first = await page.request.post('/api/visits', {
      data: {
        staffMemberId: staff[0].id,
        clientId,
        startsAt: `${DAY}T09:00:00.000Z`,
        durationMin: 60,
        description: 'Konsultacja',
      },
    });
    expect(first.status()).toBe(201);

    await page.goto(`/panel/kalendarz?dzien=${DAY}`);
    await page.getByRole('button', { name: 'Nowa Wizyta' }).click();
    const form = page.getByRole('dialog', { name: 'Nowa Wizyta' });
    await pickClient(page, 'Basia');
    await form.getByLabel('Godzina').fill('10:30');
    await form.getByLabel('Opis').fill('Grzywka');
    await form.getByRole('button', { name: 'Zapisz' }).click();

    const alert = form.getByRole('alert');
    await expect(alert).toContainText('Wizyta nachodzi na inne wpisy');
    await expect(alert).toContainText('12.11.2026, 10:00–11:00 Basia Kolizja');

    await form.getByRole('button', { name: 'Zapisz mimo to' }).click();
    await expect(form).toBeHidden();
    await expect(
      page.getByRole('button', { name: /^10:\d\d–\d\d:\d\d, Basia Kolizja/ }),
    ).toHaveCount(2);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the form takes the whole screen and saves without scrolling sideways', async ({
    page,
  }) => {
    await loggedInOwner(page.request);
    await addServices(page.request, [
      { name: 'Strzyżenie męskie', durationMin: 30 },
    ]);
    await addClient(page.request, 'Celina Telefon');

    await page.goto(`/panel/kalendarz?dzien=${DAY}`);
    await page.getByRole('button', { name: 'Nowa Wizyta' }).click();
    const form = page.getByRole('dialog', { name: 'Nowa Wizyta' });
    await expect(form).toBeVisible();
    expect(await form.boundingBox()).toEqual({
      x: 0,
      y: 0,
      width: 390,
      height: 844,
    });

    await pickClient(page, 'Celina');
    await form.getByLabel('Godzina').fill('12:00');
    await pickService(page, 'Strzyżenie męskie');
    await form.getByRole('button', { name: '45 min' }).click();
    await expect(form.getByLabel('Czas trwania (min)')).toHaveValue('45');

    const scrollsSideways = () =>
      form.evaluate((dialog) =>
        [dialog, ...dialog.querySelectorAll('*')].some(
          (el) =>
            getComputedStyle(el).overflowX !== 'visible' &&
            el.scrollWidth > el.clientWidth,
        ),
      );
    expect(await scrollsSideways()).toBe(false);

    const save = form.getByRole('button', { name: 'Zapisz' });
    await expect(save).toBeInViewport();
    await save.click();
    await expect(form).toBeHidden();
    await expect(
      page.getByRole('button', { name: /12:00–12:45, Celina Telefon/ }),
    ).toBeAttached();
  });
});

import { expect, test } from '@playwright/test';
import { loggedInOwner } from './support/invited-owner';

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw',
}).format(new Date());

/** `YYYY-MM-DD` `days` after today in Warsaw. */
function fromToday(days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test('the Właściciel adds an Ogłoszenie, sees the groups and deletes it, and the Wizytówka follows', async ({
  page,
}) => {
  const owner = await loggedInOwner(page.request);
  for (const [title, showFrom, showUntil] of [
    ['Zaplanowane', fromToday(7), null],
    ['Minione', fromToday(-10), fromToday(-1)],
  ]) {
    const res = await page.request.post('/api/announcements', {
      data: { title, body: `${title}: treść`, showFrom, showUntil },
    });
    expect(res.status()).toBe(201);
  }

  await page.goto('/panel/ustawienia');
  await page
    .getByRole('tablist', { name: 'Ustawienia' })
    .getByRole('tab', { name: 'Ogłoszenia' })
    .click();
  await expect(page).toHaveURL('/panel/ustawienia/ogloszenia');
  const group = (name: string) => page.getByRole('list', { name });
  await expect(group('Zaplanowane')).toContainText('Zaplanowane');
  await expect(group('Minione')).toContainText('Minione');
  await expect(page.getByRole('region', { name: /Aktywne/ })).toContainText(
    'Teraz Wizytówka nie pokazuje żadnego Ogłoszenia.',
  );

  await page.getByRole('button', { name: 'Dodaj Ogłoszenie' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tytuł').fill('Nowy fotel');
  await dialog.getByLabel('Treść').fill('Zapraszamy na strzyżenie.');
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(dialog).toBeHidden();
  await expect(group('Aktywne')).toContainText('Nowy fotel');

  // The Wizytówka may be cached for a minute; a new query string skips the cache.
  let reads = 0;
  const shown = async () => {
    const res = await page.request.get(
      `/api/public/pages/${owner.slug}?read=${++reads}`,
    );
    return (await res.json()).announcements.map(
      (a: { title: string }) => a.title,
    );
  };
  expect(await shown()).toEqual(['Nowy fotel']);

  await page.getByRole('button', { name: 'Usuń: Nowy fotel' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Usuń' }).click();
  // An open dialog hides the page from roles, so wait for it before looking at the row.
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('listitem', { name: 'Nowy fotel' })).toHaveCount(
    0,
  );
  expect(await shown()).toEqual([]);
});

test('Zdjęcie Ogłoszenia saves a square, rolls back on Escape and backdrop, and fits desktop and phone', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const owner = await loggedInOwner(page.request);
  const sharp = (await import('sharp')).default;
  const png = await sharp({
    create: { width: 1400, height: 1400, channels: 3, background: '#795548' },
  })
    .png()
    .toBuffer();
  const uploadFile = {
    name: 'announcement.png',
    mimeType: 'image/png',
    buffer: png,
  };
  await page.goto('/panel/ustawienia/ogloszenia');
  await page.getByRole('button', { name: 'Dodaj Ogłoszenie' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tytuł').fill('Kwadrat');
  await dialog.getByLabel('Treść').fill('Nowe Zdjęcie Ogłoszenia.');
  const choose = async () => {
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/photos') && r.request().method() === 'POST',
    );
    await dialog.locator('input[type=file]').setInputFiles(uploadFile);
    const source = await (await response).json();
    await expect(
      dialog.getByRole('button', { name: 'Zatwierdź kadr' }),
    ).toBeEnabled();
    await expect(dialog.locator('.ngx-ic-cropper')).not.toHaveClass(
      /ngx-ic-round/,
    );
    return source;
  };
  const source = await choose();
  await expect(
    dialog.getByRole('button', { name: 'Zapisz', exact: true }),
  ).toBeDisabled();
  const cropResponse = page.waitForResponse((r) =>
    r.url().endsWith(`/photos/${source.id}/crop`),
  );
  await dialog.getByRole('button', { name: 'Zatwierdź kadr' }).click();
  let square = await (await cropResponse).json();
  expect(square).toMatchObject({ width: 1200, height: 1200 });
  expect((await page.request.get(source.url)).status()).toBe(404);
  await dialog.getByRole('button', { name: 'Zapisz', exact: true }).click();
  await expect(dialog).toBeHidden();

  for (const close of ['Escape', 'backdrop']) {
    await page.getByRole('button', { name: 'Edytuj: Kwadrat' }).click();
    const abandoned = await choose();
    if (close === 'Escape') await page.keyboard.press('Escape');
    else
      await page
        .locator('.cdk-overlay-backdrop')
        .click({ position: { x: 5, y: 5 } });
    await expect(dialog).toBeHidden();
    await expect
      .poll(async () => (await page.request.get(abandoned.url)).status())
      .toBe(404);
    const saved = await (await page.request.get('/api/announcements')).json();
    expect(saved[0].photoId).toBe(square.id);
    expect((await page.request.get(square.url)).status()).toBe(200);
  }

  // The server can commit while the response is lost. Closing must retain that photo.
  await page.getByRole('button', { name: 'Edytuj: Kwadrat' }).click();
  const retrySource = await choose();
  const retryCrop = page.waitForResponse((r) =>
    r.url().endsWith(`/photos/${retrySource.id}/crop`),
  );
  await dialog.getByRole('button', { name: 'Zatwierdź kadr' }).click();
  square = await (await retryCrop).json();
  await page.route('**/api/announcements/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort('failed');
    } else await route.continue();
  });
  await dialog.getByRole('button', { name: 'Zapisz', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.unroute('**/api/announcements/*');
  const persisted = await (await page.request.get('/api/announcements')).json();
  expect(persisted[0].photoId).toBe(square.id);
  expect((await page.request.get(square.url)).status()).toBe(200);

  // A legacy rectangular Photo remains rectangular after editing only the text.
  const legacyFile = {
    ...uploadFile,
    buffer: await sharp({
      create: { width: 1600, height: 900, channels: 3, background: '#1976d2' },
    })
      .png()
      .toBuffer(),
  };
  const legacy = await (
    await page.request.post('/api/photos', { multipart: { file: legacyFile } })
  ).json();
  const legacyAnnouncement = await (
    await page.request.post('/api/announcements', {
      data: {
        title: 'Starsze zdjęcie',
        body: 'Treść',
        showFrom: today,
        photoId: legacy.id,
      },
    })
  ).json();
  await page.request.patch(`/api/announcements/${legacyAnnouncement.id}`, {
    data: { body: 'Zmieniona treść' },
  });
  const publicPage = await context.newPage();
  for (const width of [1280, 375]) {
    await publicPage.setViewportSize({ width, height: 900 });
    await publicPage.goto(`/${owner.slug}`);
    for (const [title, ratio] of [
      ['Kwadrat', 1],
      ['Starsze zdjęcie', 1600 / 900],
    ] as const) {
      const card = publicPage.locator('.announcement').filter({
        has: publicPage.getByRole('heading', { name: title, exact: true }),
      });
      const image = card.locator('img');
      // SSR hydration can briefly replace the elements between layout reads.
      await expect(async () => {
        await expect(image).toBeVisible();
        const img = await image.boundingBox();
        const heading = await card.locator('h3').boundingBox();
        if (!img || !heading)
          throw new Error('Układ Ogłoszenia nie jest jeszcze widoczny');
        expect(img.width).toBeLessThanOrEqual(400);
        expect(img.width / img.height).toBeCloseTo(ratio, 2);
        expect(heading.y).toBeGreaterThanOrEqual(img.y + img.height);
        expect(img.x + img.width / 2).toBeCloseTo(
          heading.x + heading.width / 2,
          0,
        );
        expect(img.x + img.width).toBeLessThanOrEqual(width);
      }).toPass({ timeout: 10_000 });
    }
    await publicPage.screenshot({
      path: testInfo.outputPath(`announcements-${width}.png`),
      fullPage: true,
    });
  }
  await publicPage.close();
});

import { expect, request, test } from '@playwright/test';
import { resolve } from 'node:path';
import { ADMINISTRATOR, newSalonData, PASSWORD } from './support/invited-owner';
import { BASE_URL } from './support/base-url';
import { linkSentTo } from './support/mailpit';

test('header layouts persist only on save and render on desktop and phone', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const admin = await request.newContext({ baseURL: BASE_URL });
  const data = newSalonData();
  const salonName = `Studio ${'BardzoDługaNazwaSalonu'.repeat(5)} ${data.slug}`;
  try {
    expect(
      (await admin.post('/api/auth/login', { data: ADMINISTRATOR })).ok(),
    ).toBe(true);
    expect(
      (
        await admin.post('/api/admin/salons', {
          data: {
            name: salonName,
            slug: data.slug,
            ownerName: data.ownerName,
            ownerEmail: data.email,
          },
        })
      ).ok(),
    ).toBe(true);
  } finally {
    await admin.dispose();
  }
  const link = await linkSentTo(data.email, 'zaproszenie');
  expect(
    (
      await page.request.post('/api/auth/accept-invitation', {
        data: { token: link.split('/').at(-1), password: PASSWORD },
      })
    ).ok(),
  ).toBe(true);
  const settings = '/api/salon/page';
  const publicUrl = `/api/public/pages/${data.slug}`;
  const publicSalon = async () =>
    (await (await page.request.get(publicUrl)).json()).salon;
  expect((await publicSalon()).headerLayout).toBe('CLASSIC');

  const photo = await page.request.post('/api/photos', {
    multipart: {
      file: {
        name: 'header.png',
        mimeType: 'image/png',
        buffer: await import('node:fs/promises').then((fs) =>
          fs.readFile(
            resolve(__dirname, '../../api/test/fixtures/transparent.png'),
          ),
        ),
      },
    },
  });
  expect(photo.ok()).toBe(true);
  const { id } = await photo.json();
  expect(
    (
      await page.request.patch(settings, {
        data: {
          logoPhotoId: id,
          heroPhotoId: id,
          about: 'Treść O nas pozostaje w swojej sekcji.',
          phone: '600123456',
          city: 'Łódź',
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/panel/ustawienia/wizytowka');
  await page.getByRole('tab', { name: 'Wygląd', exact: true }).click();
  await expect(page.locator('.mat-tab-body-animating')).toHaveCount(0);
  await page.getByRole('radio', { name: /^Kompaktowy/ }).check();
  expect((await publicSalon()).headerLayout).toBe('CLASSIC');

  await page.route('**/api/salon/page', async (route) => {
    if (route.request().method() === 'PATCH')
      await route.fulfill({ status: 500, json: { message: 'Błąd' } });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Zapisz', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await publicSalon()).headerLayout).toBe('CLASSIC');
  await page.unroute('**/api/salon/page');

  const publicPage = await context.newPage();
  for (const [layout, label] of [
    ['COMPACT', 'Kompaktowy'],
    ['PHOTO_SIDE', 'Zdjęcie obok danych'],
    ['CLASSIC', 'Klasyczny'],
  ] as const) {
    await page.getByRole('radio', { name: new RegExp(`^${label}`) }).check();
    await page.getByRole('button', { name: 'Zapisz', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Zapisano Wizytówkę');
    await page.reload();
    await page.getByRole('tab', { name: 'Wygląd', exact: true }).click();
    await expect(page.locator('.mat-tab-body-animating')).toHaveCount(0);
    await expect(
      page.getByRole('radio', { name: new RegExp(`^${label}`) }),
    ).toBeChecked();
    expect(await publicSalon()).toMatchObject({
      headerLayout: layout,
      hero: { id },
      logo: { id },
      about: 'Treść O nas pozostaje w swojej sekcji.',
    });
    for (const width of [1280, 375]) {
      await publicPage.setViewportSize({ width, height: 900 });
      await publicPage.goto(`/${data.slug}`);
      await expect(publicPage.locator('header h1')).toHaveText(salonName);
      await expect(publicPage.locator('header .hero-photo')).toHaveCount(
        layout === 'COMPACT' ? 0 : 1,
      );
      await expect(publicPage.locator('header .call')).toBeVisible();
      await expect(publicPage.locator('header')).not.toContainText(
        'Treść O nas',
      );
      expect(
        await publicPage.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      if (layout === 'PHOTO_SIDE') {
        const hero = await publicPage
          .locator('header .hero-photo')
          .boundingBox();
        const body = await publicPage.locator('.header-body').boundingBox();
        expect(hero).not.toBeNull();
        expect(body).not.toBeNull();
        if (width >= 768)
          expect(body!.x).toBeGreaterThanOrEqual(hero!.x + hero!.width);
        else expect(body!.y).toBeGreaterThanOrEqual(hero!.y + hero!.height);
      }
      await publicPage.screenshot({
        path: testInfo.outputPath(`${layout}-${width}.png`),
        fullPage: true,
      });
    }
  }
  expect(
    (
      await page.request.patch(settings, {
        data: { heroPhotoId: null, logoPhotoId: null, phone: null, city: null },
      })
    ).ok(),
  ).toBe(true);
  for (const layout of ['CLASSIC', 'PHOTO_SIDE', 'COMPACT']) {
    expect(
      (
        await page.request.patch(settings, { data: { headerLayout: layout } })
      ).ok(),
    ).toBe(true);
    for (const width of [1280, 375]) {
      await publicPage.setViewportSize({ width, height: 900 });
      await publicPage.goto(`/${data.slug}`);
      await expect(
        publicPage.locator('header img, header .header-address, header .call'),
      ).toHaveCount(0);
      expect(
        await publicPage.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await publicPage.screenshot({
        path: testInfo.outputPath(`${layout}-empty-${width}.png`),
        fullPage: true,
      });
    }
  }
  await publicPage.close();
});

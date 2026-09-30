import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loggedInOwner } from './support/invited-owner';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../api/test/fixtures', name));

test('the Właściciel uploads 5 photos at once, a HEIC among them, and deletes one', async ({
  page,
}) => {
  const owner = await loggedInOwner(page.request);
  const png = fixture('transparent.png');

  await page.goto('/panel/ustawienia');
  await page
    .getByRole('tablist', { name: 'Ustawienia' })
    .getByRole('tab', { name: 'Galeria' })
    .click();
  await expect(page).toHaveURL('/panel/ustawienia/galeria');
  await expect(page.getByText('Galeria jest pusta')).toBeVisible();

  await page.getByLabel('Wybierz zdjęcia').setInputFiles([
    {
      name: 'IMG_0001.HEIC',
      mimeType: 'image/heic',
      buffer: fixture('iphone.heic'),
    },
    {
      name: 'rotated.jpg',
      mimeType: 'image/jpeg',
      buffer: fixture('rotated-exif-6.jpg'),
    },
    { name: 'a.png', mimeType: 'image/png', buffer: png },
    { name: 'b.png', mimeType: 'image/png', buffer: png },
    { name: 'c.png', mimeType: 'image/png', buffer: png },
  ]);

  const photos = page
    .getByRole('list', { name: 'Zdjęcia galerii' })
    .getByRole('listitem');
  await expect(photos).toHaveCount(5, { timeout: 30_000 });
  await expect(
    page.getByRole('list', { name: 'Wysyłane zdjęcia' }),
  ).toBeHidden();
  await expect(page.getByText('5 z 30')).toBeVisible();

  await page.reload();
  await expect(photos).toHaveCount(5);

  await page.getByRole('button', { name: 'Usuń zdjęcie 1' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Usuń' }).click();
  await expect(photos).toHaveCount(4);

  // The Wizytówka may be cached for a minute; a new query string skips the cache.
  const wizytowka = await page.request.get(
    `/api/public/pages/${owner.slug}?read=gallery`,
  );
  expect((await wizytowka.json()).gallery).toHaveLength(4);
});

test('a full gallery refuses photo number 31 and the picker is blocked', async ({
  page,
}) => {
  await loggedInOwner(page.request);
  const png = fixture('transparent.png');
  const uploadToGallery = async () => {
    const photo = await page.request.post('/api/photos', {
      multipart: {
        file: { name: 'a.png', mimeType: 'image/png', buffer: png },
      },
    });
    expect(photo.status()).toBe(201);
    return page.request.post('/api/gallery', {
      data: { photoId: (await photo.json()).id },
    });
  };
  for (let i = 0; i < 30; i++) {
    expect((await uploadToGallery()).status()).toBe(201);
  }

  const extra = await uploadToGallery();
  expect(extra.status()).toBe(422);
  expect((await extra.json()).message).toBe(
    'Galeria może mieć najwyżej 30 zdjęć',
  );

  await page.goto('/panel/ustawienia/galeria');
  await expect(
    page.getByRole('list', { name: 'Zdjęcia galerii' }).getByRole('listitem'),
  ).toHaveCount(30);
  await expect(
    page.getByRole('button', { name: 'Wybierz zdjęcia' }),
  ).toBeDisabled();
  await expect(page.getByText('galeria jest pełna')).toBeVisible();
});

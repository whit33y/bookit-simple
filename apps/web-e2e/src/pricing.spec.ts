import { expect, Locator, Page, test } from '@playwright/test';
import { loggedInOwner } from './support/invited-owner';

/** Drags the row by its handle onto another row, in small steps so the CDK sees a drag. */
async function dragRow(page: Page, from: Locator, to: Locator) {
  const handle = from.locator('.handle');
  const start = await handle.boundingBox();
  const end = await to.boundingBox();
  if (!start || !end) throw new Error('Rows not visible');
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, end.y + end.height / 2, {
    steps: 20,
  });
  await page.mouse.up();
}

test('the Właściciel adds Kategorie Usług, and their dragged order stays after a reload', async ({
  page,
}) => {
  await loggedInOwner(page.request);

  await page.goto('/panel/ustawienia');
  await page
    .getByRole('tablist', { name: 'Ustawienia' })
    .getByRole('tab', { name: 'Cennik' })
    .click();
  await expect(page).toHaveURL('/panel/ustawienia/cennik');
  await expect(page.getByRole('heading', { name: 'Cennik' })).toBeVisible();

  const list = page.getByRole('list', { name: 'Kategorie Usług' });
  const names = list.locator('.name');
  for (const name of ['Strzyżenie', 'Koloryzacja', 'Paznokcie']) {
    await page.getByLabel('Nazwa nowej Kategorii').fill(name);
    await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
    await expect(names.last()).toHaveText(name);
  }

  const row = (name: string) =>
    list.getByRole('listitem').filter({ hasText: name });
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/service-categories/order') &&
      r.request().method() === 'PUT',
  );
  await dragRow(page, row('Paznokcie'), row('Strzyżenie'));
  expect((await saved).status()).toBe(204);
  await expect(names).toHaveText(['Paznokcie', 'Strzyżenie', 'Koloryzacja']);

  await page.reload();
  await expect(names).toHaveText(['Paznokcie', 'Strzyżenie', 'Koloryzacja']);

  await page.getByRole('button', { name: 'Usuń: Koloryzacja' }).click();
  await expect(names).toHaveText(['Paznokcie', 'Strzyżenie']);
  await page.reload();
  await expect(names).toHaveText(['Paznokcie', 'Strzyżenie']);
});

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

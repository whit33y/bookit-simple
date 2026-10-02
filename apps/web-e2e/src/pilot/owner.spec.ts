import { addDays } from '@bookit/shared';
import {
  expect,
  logIn,
  logInRequest,
  nextWorkingDay,
  test,
  today,
} from '../support/studio-kora';

test.use({
  viewport: { width: 1280, height: 800 },
  timezoneId: 'Europe/Warsaw',
});
test.describe.configure({ timeout: 120_000 });

test('Właściciel: Magda changes a Cena, checks what Kasia did and adds an Ogłoszenie until tomorrow', async ({
  page,
  browser,
  studioKora,
}) => {
  const kora = await studioKora();

  // Kasia, at the desk earlier: one Wizyta cancelled, the Klient of another did not come.
  const kasia = await browser.newContext();
  await logInRequest(kasia.request, kora.emails.kasia);
  const { visits } = await nextWorkingDay(kasia.request, 'Kasia');
  const [cancelled, missed] = visits;
  for (const [visit, action] of [
    [cancelled, 'cancel'],
    [missed, 'no-show'],
  ] as const) {
    const done = await kasia.request.post(`/api/visits/${visit.id}/${action}`);
    expect(done.status()).toBe(200);
  }
  await kasia.close();

  await logIn(page, kora.emails.magda);

  // A new Cena in the Cennik, and on the Wizytówka.
  await page.goto('/panel/ustawienia/cennik');
  const haircuts = page.getByRole('region', { name: 'Strzyżenie' });
  const row = haircuts
    .getByRole('listitem')
    .filter({ hasText: 'Strzyżenie damskie' });
  await expect(row).toContainText('od 90 zł');
  await row.getByRole('button', { name: 'Edytuj: Strzyżenie damskie' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cena', { exact: true }).fill('95');
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('od 95 zł');

  // A new query string each time skips a cached Wizytówka.
  await page.goto(`/${kora.slug}?po=cenie`);
  const service = page
    .locator('.service')
    .filter({ hasText: 'Strzyżenie damskie' });
  await expect(service.locator('.price')).toHaveText('od 95 zł');

  // The Historia zmian of Kasia: her two changes, newest first.
  await page.goto('/panel/ustawienia/historia');
  const changes = page.getByRole('list', { name: 'Historia zmian' });
  await expect(changes.getByRole('listitem').first()).toBeVisible();
  await page.getByLabel('Kto zmienił').selectOption({ label: 'Kasia' });
  await expect(changes.getByRole('listitem')).toHaveCount(2);
  await expect(changes.getByRole('listitem')).toContainText([
    `Wizyta nieodbyta: ${missed.client.name}`,
    `Odwołanie Wizyty: ${cancelled.client.name}`,
  ]);
  for (const item of await changes.getByRole('listitem').all()) {
    await expect(item.locator('.author')).toHaveText('Kasia');
  }

  // An Ogłoszenie from today to tomorrow.
  const tomorrow = addDays(today(), 1);
  await page.goto('/panel/ustawienia/ogloszenia');
  await page.getByRole('button', { name: 'Dodaj Ogłoszenie' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Tytuł').fill('Jutro krócej');
  await form.getByLabel('Treść').fill('Jutro zamykamy o 17:00.');
  await form.getByLabel('Pokazuj do').fill(tomorrow);
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/announcements') && r.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Zapisz' }).click();
  expect(await (await saved).json()).toMatchObject({
    title: 'Jutro krócej',
    showFrom: today(),
    showUntil: tomorrow,
  });
  await expect(form).toBeHidden();
  await expect(page.getByRole('list', { name: 'Aktywne' })).toContainText(
    'Jutro krócej',
  );

  await page.goto(`/${kora.slug}?po=ogloszeniu`);
  await expect(
    page.locator('.announcement').filter({ hasText: 'Jutro krócej' }),
  ).toContainText('Jutro zamykamy o 17:00.');
});

import { addDays, warsawDate } from '@bookit/shared';
import { PASSWORD } from '../support/invited-owner';
import {
  calendar,
  expect,
  logIn,
  test,
  today,
  visitName,
} from '../support/studio-kora';

test.use({
  viewport: { width: 1280, height: 800 },
  timezoneId: 'Europe/Warsaw',
});
test.describe.configure({ timeout: 120_000 });

test('odejście: Magda removes Kasia and keeps her Wizyty, which stay in her column until the last one, and Kasia cannot log in', async ({
  page,
  browser,
  studioKora,
}) => {
  const kora = await studioKora();
  const kasia = await (await browser.newContext()).newPage();
  await logIn(kasia, kora.emails.kasia);
  await logIn(page, kora.emails.magda);

  // Her last Wizyta in the calendar; the seed fills this week and the next one.
  const shown = await calendar(page.request, today(), addDays(today(), 13));
  const kasiaId = shown.staff.find((p) => p.displayName === 'Kasia')?.id;
  const last = shown.visits
    .filter((v) => v.staffMemberId === kasiaId && v.state === 'SCHEDULED')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .at(-1);
  if (!last) throw new Error('Kasia has no Wizyty ahead');
  const lastDay = warsawDate(new Date(last.startsAt));

  await page.goto('/panel/ustawienia/personel');
  const row = page.getByRole('listitem').filter({ hasText: 'Kasia' });
  await row.getByRole('button', { name: 'Usuń z Personelu: Kasia' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Zachować Wizyty?');
  await dialog.getByRole('button', { name: 'Zachowaj Wizyty' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Kasia nie jest już w Personelu.',
  );
  await expect(row).toHaveCount(0);

  // On the day of her last Wizyta, her column is there, with it, and takes no new ones.
  const names = page.locator('app-calendar-day-grid .name');
  await page.goto(`/panel/kalendarz?dzien=${lastDay}`);
  await expect(names).toHaveText([
    'Magda',
    'Ola',
    'Natalia',
    'Kasia (usunięta)',
  ]);
  await expect(
    page.getByRole('button', { name: visitName(last) }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Kasia, 9:00', exact: true }),
  ).toBeDisabled();

  // The day after, it is gone.
  await page.getByRole('link', { name: 'Następny dzień' }).click();
  await expect(page).toHaveURL(`/panel/kalendarz?dzien=${addDays(lastDay, 1)}`);
  await expect(names).toHaveText(['Magda', 'Ola', 'Natalia']);

  // Her session went with the account, and the password no longer works.
  await kasia.reload();
  await expect(kasia).toHaveURL(/\/logowanie/);
  await kasia.getByLabel('E-mail').fill(kora.emails.kasia);
  await kasia.getByLabel('Hasło', { exact: true }).fill(PASSWORD);
  await kasia.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(kasia.getByRole('alert')).toHaveText(
    'Nieprawidłowy e-mail lub hasło',
  );
  await expect(kasia).toHaveURL(/\/logowanie/);
});

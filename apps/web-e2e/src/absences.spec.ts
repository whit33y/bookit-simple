import {
  APIRequestContext,
  Browser,
  expect,
  Page,
  test,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { addAbsence } from './support/absence-form';
import { loggedInOwner, PASSWORD } from './support/invited-owner';
import { linkSentTo } from './support/mailpit';

// A Friday.
const FRIDAY = '2026-11-13';

interface AbsenceView {
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

/** A new Pracownik Kasia of the Właściciel on `request`, logged in on a page of her own. */
async function kasia(
  request: APIRequestContext,
  browser: Browser,
): Promise<Page> {
  const email = `kasia-${randomUUID().slice(0, 8)}@bookit.test`;
  const invited = await request.post('/api/staff/invite', {
    data: { displayName: 'Kasia', email, role: 'EMPLOYEE' },
  });
  expect(invited.status()).toBe(201);
  const page = await (await browser.newContext()).newPage();
  const token = (await linkSentTo(email, 'zaproszenie')).split('/').at(-1);
  const accepted = await page.request.post('/api/auth/accept-invitation', {
    data: { token, password: PASSWORD },
  });
  expect(accepted.ok()).toBe(true);
  return page;
}

async function absencesOn(
  request: APIRequestContext,
  day: string,
): Promise<AbsenceView[]> {
  const reply = await request.get('/api/calendar', {
    params: { from: day, to: day },
  });
  expect(reply.ok()).toBe(true);
  return ((await reply.json()) as { absences: AbsenceView[] }).absences;
}

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a Pracownik adds a Nieobecność on the whole Friday and sees it hatched in her column', async ({
    page,
    browser,
  }) => {
    await loggedInOwner(page.request);
    const employee = await kasia(page.request, browser);

    await employee.goto(`/panel/kalendarz?dzien=${FRIDAY}`);
    await addAbsence(employee, {
      person: 'Kasia',
      from: FRIDAY,
      to: FRIDAY,
      reason: 'Urlop',
    });

    const absence = employee.getByRole('button', {
      name: 'Nieobecność, Kasia, Urlop',
    });
    await expect(absence).toBeVisible();
    await expect(absence).toHaveCSS(
      'background-image',
      /repeating-linear-gradient/,
    );
    // In the column of Kasia's empty fields.
    const column = await employee
      .getByRole('button', { name: 'Kasia, 9:00' })
      .evaluate((slot) => getComputedStyle(slot).gridColumnStart);
    await expect(absence).toHaveCSS('grid-column-start', column);

    expect(await absencesOn(employee.request, FRIDAY)).toEqual([
      expect.objectContaining({
        startsAt: '2026-11-12T23:00:00.000Z',
        endsAt: '2026-11-13T23:00:00.000Z',
        reason: 'Urlop',
      }),
    ]);
  });

  test('a Nieobecność of several days over the change of the clocks ends at the midnight after the last one', async ({
    page,
  }) => {
    await loggedInOwner(page.request);

    // Saturday 24 to Monday 26 October 2026; the clocks go back on Sunday.
    await page.goto('/panel/kalendarz?dzien=2026-10-24');
    await addAbsence(page, {
      from: '2026-10-24',
      to: '2026-10-26',
      reason: 'Urlop',
    });

    for (const day of ['2026-10-24', '2026-10-25', '2026-10-26']) {
      await page.goto(`/panel/kalendarz?dzien=${day}`);
      await expect(
        page.getByRole('button', { name: 'Nieobecność, Ewa, Urlop' }),
      ).toBeVisible();
    }
    expect(await absencesOn(page.request, '2026-10-25')).toEqual([
      expect.objectContaining({
        startsAt: '2026-10-23T22:00:00.000Z',
        endsAt: '2026-10-26T23:00:00.000Z',
      }),
    ]);
    expect(await absencesOn(page.request, '2026-10-27')).toEqual([]);
  });

  test('a Nieobecność clicked is edited and removed, and an end before the start comes under "Do"', async ({
    page,
  }) => {
    await loggedInOwner(page.request);
    await page.goto(`/panel/kalendarz?dzien=${FRIDAY}`);
    await addAbsence(page, {
      from: FRIDAY,
      to: FRIDAY,
      times: { from: '10:00', to: '12:00' },
      reason: 'Lekarz',
    });

    await page.getByRole('button', { name: 'Nieobecność, Ewa, Lekarz' }).click();
    const form = page.getByRole('dialog', { name: 'Edycja Nieobecności' });
    await expect(form.getByLabel('Od godziny')).toHaveValue('10:00');
    await form.getByLabel('Do godziny').fill('09:00');
    await form.getByRole('button', { name: 'Zapisz' }).click();
    await expect(form).toContainText(
      'Koniec Nieobecności musi być po jej początku',
    );

    await form.getByLabel('Do godziny').fill('13:00');
    await form.getByLabel('Powód').fill('Dentysta');
    await form.getByRole('button', { name: 'Zapisz' }).click();
    await expect(form).toBeHidden();
    const absence = page.getByRole('button', {
      name: 'Nieobecność, Ewa, Dentysta',
    });
    await expect(absence).toBeVisible();

    await absence.click();
    await form.getByRole('button', { name: 'Usuń', exact: true }).click();
    await form.getByRole('button', { name: 'Usuń Nieobecność' }).click();
    await expect(form).toBeHidden();
    await expect(absence).toHaveCount(0);
    expect(await absencesOn(page.request, FRIDAY)).toEqual([]);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('"Nowa Nieobecność" takes the person shown', async ({ page }) => {
    await loggedInOwner(page.request);
    await page.goto(`/panel/kalendarz?dzien=${FRIDAY}`);

    await addAbsence(page, { from: FRIDAY, to: FRIDAY });

    await expect(
      page.getByRole('button', { name: 'Nieobecność, Ewa' }),
    ).toBeVisible();
  });
});

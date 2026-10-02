import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { loggedInOwner } from './support/invited-owner';
import { swipe } from './support/swipe';

// A Thursday; the week runs from Monday 9 November.
const DAY = '2026-11-12';

/** Kasia and Ola next to the Właściciel Ewa; resolves with Kasia's id. */
async function kasiaAndOla(request: APIRequestContext): Promise<string> {
  for (const displayName of ['Kasia', 'Ola']) {
    const invited = await request.post('/api/staff/invite', {
      data: {
        displayName,
        email: `${displayName.toLowerCase()}-${Date.now()}@bookit.test`,
        role: 'EMPLOYEE',
      },
    });
    expect(invited.status()).toBe(201);
  }
  const staff = (await (await request.get('/api/staff')).json()) as {
    id: string;
    displayName: string;
  }[];
  return staff.find((person) => person.displayName === 'Kasia')?.id ?? '';
}

/** The name in the head of the only column. */
const shownPerson = (page: Page) => page.locator('app-calendar-day-grid .name');

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a swipe changes the person and "+" opens the form with that person', async ({
    page,
  }) => {
    await loggedInOwner(page.request);
    await kasiaAndOla(page.request);

    await page.goto(`/panel/kalendarz?dzien=${DAY}`);
    await expect(shownPerson(page)).toHaveText('Ewa');

    await swipe(page, -200);
    await expect(shownPerson(page)).toHaveText('Kasia');
    await swipe(page, -200);
    await expect(shownPerson(page)).toHaveText('Ola');
    await swipe(page, 200);
    await expect(shownPerson(page)).toHaveText('Kasia');

    // The arrows change the day, the person stays, also after a reload.
    await page.getByRole('link', { name: 'Następny dzień' }).click();
    await expect(page).toHaveURL('/panel/kalendarz?dzien=2026-11-13');
    await page.reload();
    await expect(shownPerson(page)).toHaveText('Kasia');

    await page.getByRole('button', { name: 'Nowa Wizyta' }).click();
    const form = page.getByRole('dialog');
    await expect(form.getByRole('combobox', { name: 'Osoba' })).toHaveText(
      'Kasia',
    );
    await expect(form.getByLabel('Data')).toHaveValue('2026-11-13');
    await expect(form.getByLabel('Godzina')).toHaveValue(
      /^\d\d:(00|15|30|45)$/,
    );
  });
});

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the week view shows a Nieobecność of several days on each of them', async ({
    page,
  }) => {
    await loggedInOwner(page.request);
    const kasiaId = await kasiaAndOla(page.request);
    // From Tuesday 0:00 to Friday 0:00 in Warsaw.
    const absence = await page.request.post('/api/absences', {
      data: {
        staffMemberId: kasiaId,
        startsAt: '2026-11-09T23:00:00.000Z',
        endsAt: '2026-11-12T23:00:00.000Z',
        reason: 'Urlop',
      },
    });
    expect(absence.status()).toBe(201);

    await page.goto(`/panel/kalendarz?dzien=${DAY}`);
    await expect(page.locator('app-calendar-day-grid .name')).toHaveText([
      'Ewa',
      'Kasia',
      'Ola',
    ]);
    await page.getByRole('radio', { name: 'Tydzień' }).click();
    await expect(page).toHaveURL(
      /\/panel\/kalendarz\/tydzien\?osoba=.+&od=2026-11-09$/,
    );
    await page.getByRole('combobox', { name: 'Osoba' }).click();
    await page.getByRole('option', { name: 'Kasia' }).click();
    await expect(page).toHaveURL(
      `/panel/kalendarz/tydzien?osoba=${kasiaId}&od=2026-11-09`,
    );

    await expect(
      page.getByRole('heading', { name: '9–15 listopada 2026' }),
    ).toBeVisible();
    await expect(page.locator('app-calendar-day-grid .name')).toHaveText([
      'pon., 9.11',
      'wt., 10.11',
      'śr., 11.11',
      'czw., 12.11',
      'pt., 13.11',
      'sob., 14.11',
      'niedz., 15.11',
    ]);
    const urlop = page.locator('.absence', { hasText: 'Urlop' });
    await expect(urlop).toHaveCount(3);
    // In the columns of Tuesday, Wednesday and Thursday.
    const [tuesday, thursday] = await Promise.all([
      page
        .getByRole('button', { name: 'wtorek, 10 listopada, 9:00' })
        .boundingBox(),
      page
        .getByRole('button', { name: 'czwartek, 12 listopada, 9:00' })
        .boundingBox(),
    ]);
    const first = await urlop.first().boundingBox();
    const last = await urlop.last().boundingBox();
    expect(first?.x).toBeCloseTo(tuesday?.x ?? NaN, 0);
    expect(last?.x).toBeCloseTo(thursday?.x ?? NaN, 0);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
});

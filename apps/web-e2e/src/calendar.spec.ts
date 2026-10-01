import { expect, test } from '@playwright/test';
import { loggedInOwner } from './support/invited-owner';

test.use({ viewport: { width: 1280, height: 800 } });

test('the day view fits four columns on 1280×800, marks an Święto and greys Saturday after 15:00', async ({
  page,
}) => {
  await loggedInOwner(page.request);
  for (const displayName of ['Kasia', 'Ola', 'Natalia']) {
    const invited = await page.request.post('/api/staff/invite', {
      data: {
        displayName,
        email: `${displayName.toLowerCase()}-${Date.now()}@bookit.test`,
        role: 'EMPLOYEE',
      },
    });
    expect(invited.status()).toBe(201);
  }
  const hours = await page.request.put('/api/opening-hours', {
    data: [1, 2, 3, 4, 5]
      .map((weekday) => ({ weekday, opensAt: '09:00', closesAt: '19:00' }))
      .concat({ weekday: 6, opensAt: '09:00', closesAt: '15:00' }),
  });
  expect(hours.status()).toBe(200);

  await page.goto('/panel');
  await expect(page).toHaveURL('/panel/kalendarz');
  await page.goto('/panel/kalendarz?dzien=2026-11-11');

  await expect(
    page.getByRole('heading', { name: 'środa, 11 listopada 2026' }),
  ).toBeVisible();
  await expect(page.getByText('Święto Niepodległości')).toBeVisible();
  for (const name of ['Ewa', 'Kasia', 'Ola', 'Natalia']) {
    await expect(
      page.getByRole('main').getByText(name, { exact: true }),
    ).toBeInViewport();
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  const next = page.getByRole('link', { name: 'Następny dzień' });
  await next.click();
  await next.click();
  const saturday = page.waitForResponse((r) =>
    r.url().includes('/api/calendar?from=2026-11-14'),
  );
  await next.click();
  await expect(page).toHaveURL('/panel/kalendarz?dzien=2026-11-14');
  await saturday;
  await expect(page.getByText('Święto Niepodległości')).toBeHidden();
  await expect(page.locator('app-calendar-day-grid')).toHaveAttribute(
    'aria-busy',
    'false',
  );

  // The grey block after closing, in the last column, starts at the 15:00 line.
  const afterClosing = page.locator('.closed').last();
  const at15 = page.getByRole('button', { name: 'Natalia, 15:00' });
  // Before opening and after closing, in each of the four columns.
  await expect(page.locator('.closed')).toHaveCount(8);
  const [closedBox, slotBox] = await Promise.all([
    afterClosing.boundingBox(),
    at15.boundingBox(),
  ]);
  expect(closedBox?.y).toBeCloseTo(slotBox?.y ?? NaN, 0);
});

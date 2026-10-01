import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { loggedInOwner } from './support/invited-owner';

// A Thursday; 10:00 in Warsaw is 09:00Z.
const DAY = '2026-11-12';

/** Kasia and Ola next to the Właściciel Ewa, and a Wizyta of Kasia at 10:00–10:45. */
async function kasiaWithVisit(request: APIRequestContext): Promise<string> {
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
  const kasia = staff.find((person) => person.displayName === 'Kasia');
  const client = await request.post('/api/clients', {
    data: { name: 'Dorota Przenoszona' },
  });
  expect(client.status()).toBe(201);
  const created = await request.post('/api/visits', {
    data: {
      staffMemberId: kasia?.id,
      clientId: ((await client.json()) as { id: string }).id,
      startsAt: `${DAY}T09:00:00.000Z`,
      durationMin: 45,
      description: 'Strzyżenie',
    },
  });
  expect(created.status()).toBe(201);
  return staff.find((person) => person.displayName === 'Ola')?.id ?? '';
}

const visitOf = (page: Page) =>
  page.getByRole('button', { name: /Dorota Przenoszona/ });

/** Drags the Wizyta by as far as the empty field `from` is from `to`. */
async function dragVisit(page: Page, from: string, to: string): Promise<void> {
  const [visit, start, end] = await Promise.all([
    visitOf(page).boundingBox(),
    page.getByRole('button', { name: from, exact: true }).boundingBox(),
    page.getByRole('button', { name: to, exact: true }).boundingBox(),
  ]);
  if (!visit || !start || !end) throw new Error('The grid is not drawn');
  const x = visit.x + visit.width / 2;
  const y = visit.y + 10;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + end.x - start.x, y + end.y - start.y, {
    steps: 20,
  });
  await page.mouse.up();
}

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a Wizyta dragged from Kasia to Ola an hour later is saved there', async ({
    page,
  }) => {
    await loggedInOwner(page.request);
    const olaId = await kasiaWithVisit(page.request);

    await page.goto(`/panel/kalendarz?dzien=${DAY}`);
    await expect(visitOf(page)).toHaveAccessibleName(/^10:00–10:45/);

    const saved = page.waitForResponse(
      (r) =>
        r.url().includes('/api/visits/') && r.request().method() === 'PATCH',
    );
    await dragVisit(page, 'Kasia, 10:00', 'Ola, 11:00');
    const response = await saved;
    expect(response.request().postDataJSON()).toEqual({
      staffMemberId: olaId,
      startsAt: `${DAY}T10:00:00.000Z`,
    });
    expect(response.status()).toBe(200);
    // Dropping does not open the card.
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.reload();
    await expect(visitOf(page)).toHaveAccessibleName(/^11:00–11:45/);
    const [visit, olaSlot] = await Promise.all([
      visitOf(page).boundingBox(),
      page
        .getByRole('button', { name: 'Ola, 11:00', exact: true })
        .boundingBox(),
    ]);
    expect(visit?.x).toBeGreaterThanOrEqual(olaSlot?.x ?? NaN);
    expect(visit?.x).toBeLessThan((olaSlot?.x ?? NaN) + (olaSlot?.width ?? 0));
  });

  test('the lower edge makes the Wizyta longer by 15 min', async ({ page }) => {
    await loggedInOwner(page.request);
    await kasiaWithVisit(page.request);

    await page.goto(`/panel/kalendarz?dzien=${DAY}`);
    await expect(visitOf(page)).toHaveAccessibleName(/^10:00–10:45/);
    const [edge, start, end] = await Promise.all([
      page.locator('.resize').boundingBox(),
      page
        .getByRole('button', { name: 'Kasia, 10:00', exact: true })
        .boundingBox(),
      page
        .getByRole('button', { name: 'Kasia, 10:15', exact: true })
        .boundingBox(),
    ]);
    if (!edge || !start || !end) throw new Error('The grid is not drawn');

    const saved = page.waitForResponse(
      (r) =>
        r.url().includes('/api/visits/') && r.request().method() === 'PATCH',
    );
    const x = edge.x + edge.width / 2;
    const y = edge.y + edge.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + end.y - start.y, { steps: 10 });
    await page.mouse.up();

    const response = await saved;
    expect(response.request().postDataJSON()).toEqual({ durationMin: 60 });
    expect(response.status()).toBe(200);
    await expect(visitOf(page)).toHaveAccessibleName(/^10:00–11:00/);
  });

  test('a network error puts the Wizyta back with a message', async ({
    page,
  }) => {
    await loggedInOwner(page.request);
    await kasiaWithVisit(page.request);
    await page.route('**/api/visits/*', (route) =>
      route.request().method() === 'PATCH' ? route.abort() : route.fallback(),
    );

    await page.goto(`/panel/kalendarz?dzien=${DAY}`);
    await expect(visitOf(page)).toHaveAccessibleName(/^10:00–10:45/);
    await dragVisit(page, 'Kasia, 10:00', 'Ola, 11:00');

    await expect(page.getByText(/Nie przeniesiono Wizyty/)).toBeVisible();
    await expect(visitOf(page)).toHaveAccessibleName(/^10:00–10:45/);
    const [visit, kasiaSlot] = await Promise.all([
      visitOf(page).boundingBox(),
      page
        .getByRole('button', { name: 'Kasia, 10:00', exact: true })
        .boundingBox(),
    ]);
    expect(visit?.x).toBeGreaterThanOrEqual(kasiaSlot?.x ?? NaN);
    expect(visit?.y).toBeCloseTo(kasiaSlot?.y ?? NaN, 0);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a Wizyta cannot be dragged', async ({ page }) => {
    await loggedInOwner(page.request);
    await kasiaWithVisit(page.request);
    const patches: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'PATCH') patches.push(r.url());
    });

    await page.goto(`/panel/kalendarz?dzien=${DAY}`);
    await expect(visitOf(page)).toHaveAccessibleName(/^10:00–10:45/);
    await expect(visitOf(page)).toHaveClass(/cdk-drag-disabled/);
    await expect(page.locator('.resize')).toHaveCount(0);

    const before = await visitOf(page).boundingBox();
    await dragVisit(page, 'Kasia, 10:00', 'Kasia, 11:00');
    expect(await visitOf(page).boundingBox()).toEqual(before);
    await expect(visitOf(page)).toHaveAccessibleName(/^10:00–10:45/);
    expect(patches).toEqual([]);
  });
});

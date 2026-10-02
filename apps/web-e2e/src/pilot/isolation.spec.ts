import {
  AbsenceView,
  addDays,
  AnnouncementView,
  ServiceView,
  warsawDate,
} from '@bookit/shared';
import {
  calendar,
  expect,
  logIn,
  logInRequest,
  test,
  today,
} from '../support/studio-kora';

test.use({
  viewport: { width: 1280, height: 800 },
  timezoneId: 'Europe/Warsaw',
});
test.describe.configure({ timeout: 120_000 });

const SECRET_CLIENT = 'Tajna Klientka';

/** Only a Właściciel may call it at all; a Pracownik gets `403` before the id counts. */
const OWNER_ONLY = 'owner only';
type Status = number | typeof OWNER_ONLY;

test('izolacja: the Personel of Studio Kora sees nothing of a second Salon, in the UI or straight through the API', async ({
  browser,
  studioKora,
}) => {
  const [home, other] = await Promise.all([studioKora(), studioKora()]);

  // The second Salon, as its own Właściciel sees it: everything a request could aim at.
  const owner = await browser.newContext();
  await logInRequest(owner.request, other.emails.magda);
  const from = today();
  const to = addDays(from, 13);
  const before = await calendar(owner.request, from, to);
  const visit = before.visits[0];
  const staffMemberId = before.staff[0].id;
  const renamed = await owner.request.patch(`/api/clients/${visit.clientId}`, {
    data: { name: SECRET_CLIENT },
  });
  expect(renamed.status()).toBe(200);
  const added = await owner.request.post('/api/absences', {
    data: {
      staffMemberId,
      startsAt: visit.startsAt,
      endsAt: new Date(new Date(visit.startsAt).getTime() + 60 * 60_000),
      reason: 'Lekarz',
    },
  });
  expect(added.status()).toBe(201);
  const absence = (await added.json()) as AbsenceView;
  const theirs = await calendar(owner.request, from, to);
  const [{ id: serviceId }] = (await (
    await owner.request.get('/api/services')
  ).json()) as ServiceView[];
  const [{ id: announcementId }] = (await (
    await owner.request.get('/api/announcements')
  ).json()) as AnnouncementView[];
  const newVisit = {
    clientId: visit.clientId,
    startsAt: visit.startsAt,
    durationMin: 30,
    description: 'Obca Wizyta',
  };

  for (const person of ['magda', 'kasia'] as const) {
    const context = await browser.newContext();
    const ours = await context.newPage();
    await logIn(ours, home.emails[person]);

    // The UI: the Klient is not in the search, and her karta Klienta does not open.
    await ours.goto('/panel/klienci');
    await ours.getByLabel('Szukaj po imieniu lub telefonie').fill('Tajna');
    await expect(ours.getByText('Nikt nie pasuje do „Tajna”.')).toBeVisible();
    await ours.goto(`/panel/klienci/${visit.clientId}`);
    await expect(ours.getByRole('alert').first()).toBeVisible();
    await expect(ours.getByText(SECRET_CLIENT)).toHaveCount(0);

    // The calendar on a day of the renamed Klient's Wizyta shows only their own.
    await ours.goto(
      `/panel/kalendarz?dzien=${warsawDate(new Date(visit.startsAt))}`,
    );
    await expect(ours.locator('app-calendar-day-grid')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    await expect(ours.locator('.visit').first()).toBeAttached();
    await expect(ours.getByText(SECRET_CLIENT)).toHaveCount(0);

    // So does the API, for the same days.
    const mine = await calendar(ours.request, from, to);
    const theirIds = new Set(theirs.visits.map((v) => v.id));
    expect(mine.visits.some((v) => theirIds.has(v.id))).toBe(false);
    expect(mine.staff.map((p) => p.id)).not.toContain(staffMemberId);
    expect(mine.absences.map((a) => a.id)).not.toContain(absence.id);

    // Straight to the API with the ids of the other Salon: `404`, as if they did not
    // exist. A Pracownik gets `403` first where only a Właściciel may go at all.
    const api = ours.request;
    const search = await api.get('/api/clients', { params: { q: 'Tajna' } });
    expect(search.status()).toBe(200);
    expect(await search.json()).toEqual([]);
    const calls: [string, string, object | undefined, Status][] = [
      ['GET', `/api/clients/${visit.clientId}`, undefined, 404],
      ['GET', `/api/clients/${visit.clientId}/visits`, undefined, 404],
      ['PATCH', `/api/clients/${visit.clientId}`, { name: 'Ewa' }, 404],
      ['DELETE', `/api/clients/${visit.clientId}`, undefined, OWNER_ONLY],
      ['PATCH', `/api/visits/${visit.id}`, { durationMin: 15 }, 404],
      ['POST', `/api/visits/${visit.id}/cancel`, undefined, 404],
      ['POST', `/api/visits/${visit.id}/no-show`, undefined, 404],
      ['DELETE', `/api/visits/${visit.id}`, undefined, 404],
      // The person and the Klient are not in the Salon.
      ['POST', '/api/visits', { ...newVisit, staffMemberId }, 422],
      ['PATCH', `/api/services/${serviceId}`, { priceGrosze: 100 }, OWNER_ONLY],
      ['POST', `/api/services/${serviceId}/archive`, undefined, OWNER_ONLY],
      ['DELETE', `/api/announcements/${announcementId}`, undefined, OWNER_ONLY],
      ['PATCH', `/api/absences/${absence.id}`, { reason: 'Obca' }, 404],
      ['DELETE', `/api/absences/${absence.id}`, undefined, 404],
      [
        'PATCH',
        `/api/staff/${staffMemberId}`,
        { displayName: 'Obca' },
        OWNER_ONLY,
      ],
      [
        'GET',
        `/api/staff/${staffMemberId}/deletion-preview`,
        undefined,
        OWNER_ONLY,
      ],
    ];
    const got = await Promise.all(
      calls.map(async ([method, url, data]) => {
        const reply = await api.fetch(url, { method, data });
        return `${method} ${url} ${reply.status()}`;
      }),
    );
    expect(got).toEqual(
      calls.map(([method, url, , status]) => {
        const code =
          status !== OWNER_ONLY ? status : person === 'magda' ? 404 : 403;
        return `${method} ${url} ${code}`;
      }),
    );
    await context.close();
  }

  // The second Salon is as it was.
  expect(await calendar(owner.request, from, to)).toEqual(theirs);
  const service = await owner.request.get('/api/services');
  expect(await service.json()).toContainEqual(
    expect.objectContaining({ id: serviceId, archived: false }),
  );
  const announcement = await owner.request.get('/api/announcements');
  expect(await announcement.json()).toContainEqual(
    expect.objectContaining({ id: announcementId }),
  );
  await owner.close();
});

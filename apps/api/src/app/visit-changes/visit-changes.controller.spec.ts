import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  DELETED_CLIENT_NAME,
  VISIT_CHANGE_QUERY_INVALID,
  VISIT_CHANGES_PAGE_SIZE,
  VisitChangePage,
  VisitChangeView,
  VisitView,
} from '@bookit/shared';
import { hash } from 'argon2';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';
import { VisitChangeRecorder } from './visit-change-recorder';

const PASSWORD = 'correct horse battery staple';
const VISITS = '/api/visits';
const CHANGES = '/api/visit-changes';

describe('Historia zmian', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  let app: INestApplication;
  let passwordHash: string;

  const unique = () => randomUUID().slice(0, 8);

  async function logIn(salonId: string, role: 'OWNER' | 'EMPLOYEE') {
    const email = `visit-changes-${unique()}@bookit.test`;
    const user = await raw.user.create({ data: { email, passwordHash } });
    const staffMember = await raw.staffMember.create({
      data: { salonId, userId: user.id, role, displayName: `Kasia ${role}` },
    });
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { agent, staffMember };
  }

  /** The Salon the tests log in to, once: logging in is slow. */
  let team: {
    salon: { id: string };
    owner: Awaited<ReturnType<typeof logIn>>;
    employee: Awaited<ReturnType<typeof logIn>>;
  };

  function addClient(salonId: string, name: string) {
    return raw.client.create({
      data: { salonId, name, nameNormalized: name.toLowerCase() },
    });
  }

  /** For this test alone: a person whose calendar it fills, a Klient and a Usługa. */
  async function salonWithVisitData() {
    const { salon } = team;
    const person = await raw.staffMember.create({
      data: { salonId: salon.id, role: 'EMPLOYEE', displayName: 'Ewa' },
    });
    const client = await addClient(salon.id, `Anna Nowak ${unique()}`);
    const category = await raw.serviceCategory.create({
      data: { salonId: salon.id, name: `Strzyżenie ${unique()}` },
    });
    const service = await raw.service.create({
      data: {
        salonId: salon.id,
        categoryId: category.id,
        name: 'Strzyżenie damskie',
        priceGrosze: 8000,
        priceType: 'FIXED',
        durationMin: 60,
      },
    });
    return {
      salon,
      person,
      client,
      service,
      owner: team.owner.staffMember,
      employee: team.employee.staffMember,
      asOwner: team.owner.agent,
      asEmployee: team.employee.agent,
    };
  }

  type Salon = Awaited<ReturnType<typeof salonWithVisitData>>;

  /** A Wizyta of the test's person, entered by the Pracownik. Each test its own hour. */
  async function createVisit(s: Salon, startsAt = '2026-10-05T14:00:00+02:00') {
    const res = await s.asEmployee
      .post(VISITS)
      .send({
        staffMemberId: s.person.id,
        clientId: s.client.id,
        startsAt,
        durationMin: 60,
        serviceIds: [s.service.id],
        acceptCollisions: true,
      })
      .expect(201);
    return res.body as VisitView;
  }

  const changesOf = (visitId: string) =>
    raw.visitChange.findMany({ where: { visitId }, orderBy: { at: 'asc' } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    passwordHash = await hash(PASSWORD);
    const salon = await raw.salon.create({
      data: { name: `Studio ${unique()}`, slug: `historia-${unique()}` },
    });
    team = {
      salon,
      owner: await logIn(salon.id, 'OWNER'),
      employee: await logIn(salon.id, 'EMPLOYEE'),
    };
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  describe('recording', () => {
    it('records CREATED with the Wizyta, its Usługi and the names from that moment', async () => {
      const s = await salonWithVisitData();

      const visit = await createVisit(s);

      const changes = await changesOf(visit.id);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        salonId: s.salon.id,
        action: 'CREATED',
        staffMemberId: s.employee.id,
        before: null,
        after: {
          staffMemberId: s.person.id,
          staffMemberName: 'Ewa',
          clientId: s.client.id,
          clientName: s.client.name,
          startsAt: '2026-10-05T12:00:00.000Z',
          durationMin: 60,
          breakMin: 0,
          description: null,
          state: 'SCHEDULED',
          services: [
            {
              serviceId: s.service.id,
              name: 'Strzyżenie damskie',
              priceGrosze: 8000,
              priceType: 'FIXED',
            },
          ],
        },
      });
    });

    it('records exactly one entry for each action', async () => {
      const s = await salonWithVisitData();
      const visit = await createVisit(s);
      const url = `${VISITS}/${visit.id}`;

      await s.asOwner
        .patch(url)
        .send({ startsAt: '2026-10-05T15:30:00+02:00', acceptCollisions: true })
        .expect(200);
      await s.asEmployee.post(`${url}/cancel`).expect(200);
      await s.asEmployee
        .post(`${url}/restore`)
        .send({ acceptCollisions: true })
        .expect(200);
      await s.asEmployee.post(`${url}/no-show`).expect(200);
      await s.asOwner.delete(url).expect(204);

      const changes = await changesOf(visit.id);
      expect(changes.map((c) => [c.action, c.staffMemberId])).toEqual([
        ['CREATED', s.employee.id],
        ['UPDATED', s.owner.id],
        ['CANCELLED', s.employee.id],
        ['RESTORED', s.employee.id],
        ['NO_SHOW', s.employee.id],
        ['DELETED', s.owner.id],
      ]);
      expect(changes[1]).toMatchObject({
        before: { startsAt: '2026-10-05T12:00:00.000Z' },
        after: { startsAt: '2026-10-05T13:30:00.000Z' },
      });
      expect(changes[2]).toMatchObject({
        before: { state: 'SCHEDULED' },
        after: { state: 'CANCELLED' },
      });
    });

    it('records DELETED with the full Wizyta before and nothing after', async () => {
      const s = await salonWithVisitData();
      const visit = await createVisit(s);
      const [created] = await changesOf(visit.id);

      await s.asOwner.delete(`${VISITS}/${visit.id}`).expect(204);

      const deleted = (await changesOf(visit.id)).at(-1);
      expect(deleted?.action).toBe('DELETED');
      expect(deleted?.after).toBeNull();
      expect(deleted?.before).toEqual(created.after);
    });

    it('records nothing for a change that fails', async () => {
      const s = await salonWithVisitData();
      const visit = await createVisit(s);

      await s.asEmployee.post(`${VISITS}/${visit.id}/restore`).expect(422);

      expect(await changesOf(visit.id)).toHaveLength(1);
    });

    describe('when the entry cannot be saved', () => {
      const failRecording = () =>
        jest
          .spyOn(app.get(VisitChangeRecorder), 'record')
          .mockRejectedValue(new Error('forced'));

      it('does not save the new Wizyta', async () => {
        const s = await salonWithVisitData();
        failRecording();

        await s.asEmployee
          .post(VISITS)
          .send({
            staffMemberId: s.person.id,
            clientId: s.client.id,
            startsAt: '2026-10-06T10:00:00+02:00',
            durationMin: 60,
            serviceIds: [s.service.id],
          })
          .expect(500);

        expect(
          await raw.visit.count({ where: { staffMemberId: s.person.id } }),
        ).toBe(0);
      });

      it('keeps the Wizyta as it was on an edit, a state change and a deletion', async () => {
        const s = await salonWithVisitData();
        const visit = await createVisit(s);
        const url = `${VISITS}/${visit.id}`;
        failRecording();

        await s.asOwner
          .patch(url)
          .send({ durationMin: 90, acceptCollisions: true })
          .expect(500);
        await s.asOwner.post(`${url}/cancel`).expect(500);
        await s.asOwner.post(`${url}/no-show`).expect(500);
        await s.asOwner.delete(url).expect(500);

        expect(
          await raw.visit.findUniqueOrThrow({ where: { id: visit.id } }),
        ).toMatchObject({ durationMin: 60, state: 'SCHEDULED' });
        expect(await changesOf(visit.id)).toHaveLength(1);
      });
    });
  });

  describe('GET /api/visits/:id/changes', () => {
    it('lists the entries of one Wizyta, newest first, with who made them', async () => {
      const s = await salonWithVisitData();
      const visit = await createVisit(s);
      await s.asOwner.post(`${VISITS}/${visit.id}/cancel`).expect(200);

      const res = await s.asOwner
        .get(`${VISITS}/${visit.id}/changes`)
        .expect(200);

      const items = res.body as VisitChangeView[];
      expect(items.map((c) => [c.action, c.staffMemberName])).toEqual([
        ['CANCELLED', 'Kasia OWNER'],
        ['CREATED', 'Kasia EMPLOYEE'],
      ]);
      expect(items[1]).toEqual({
        id: expect.any(String),
        visitId: visit.id,
        at: expect.any(String),
        action: 'CREATED',
        staffMemberId: s.employee.id,
        staffMemberName: 'Kasia EMPLOYEE',
        before: null,
        after: expect.objectContaining({ clientName: s.client.name }),
      });
    });

    it('still lists the entries of a deleted Wizyta', async () => {
      const s = await salonWithVisitData();
      const visit = await createVisit(s);
      await s.asOwner.delete(`${VISITS}/${visit.id}`).expect(204);

      const res = await s.asOwner
        .get(`${VISITS}/${visit.id}/changes`)
        .expect(200);

      expect(res.body.map((c: VisitChangeView) => c.action)).toEqual([
        'DELETED',
        'CREATED',
      ]);
    });

    it('answers 403 to a Pracownik', async () => {
      const s = await salonWithVisitData();
      const visit = await createVisit(s);

      await s.asEmployee.get(`${VISITS}/${visit.id}/changes`).expect(403);
    });

    it('does not show the entries of another Salon', async () => {
      const s = await salonWithVisitData();
      const other = await raw.salon.create({
        data: { name: `Studio ${unique()}`, slug: `historia-${unique()}` },
      });
      const person = await raw.staffMember.create({
        data: { salonId: other.id, role: 'OWNER', displayName: 'Ola' },
      });
      const visitId = randomUUID();
      await raw.visitChange.create({
        data: {
          salonId: other.id,
          visitId,
          staffMemberId: person.id,
          action: 'DELETED',
        },
      });

      const res = await s.asOwner.get(`${VISITS}/${visitId}/changes`);

      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/visit-changes', () => {
    /** An entry of the team's Salon at `at`, about a Wizyta of `clientId`. */
    function addChange(
      s: Salon,
      at: string,
      fields: { staffMemberId?: string; clientId?: string } = {},
    ) {
      return raw.visitChange.create({
        data: {
          salonId: s.salon.id,
          visitId: randomUUID(),
          staffMemberId: fields.staffMemberId ?? s.owner.id,
          at: new Date(at),
          action: 'DELETED',
          before: { clientId: fields.clientId ?? s.client.id },
        },
      });
    }

    it('filters by Klient, before or after the change, newest first', async () => {
      const s = await salonWithVisitData();
      const visit = await createVisit(s);
      const other = await addClient(s.salon.id, `Maria ${unique()}`);
      await s.asOwner
        .patch(`${VISITS}/${visit.id}`)
        .send({ clientId: other.id })
        .expect(200);

      const mine = await s.asOwner
        .get(CHANGES)
        .query({ clientId: s.client.id })
        .expect(200);
      const theirs = await s.asOwner
        .get(CHANGES)
        .query({ clientId: other.id })
        .expect(200);

      expect(mine.body).toMatchObject({
        page: 1,
        pageSize: VISIT_CHANGES_PAGE_SIZE,
        total: 2,
      });
      expect((mine.body as VisitChangePage).items.map((c) => c.action)).toEqual(
        ['UPDATED', 'CREATED'],
      );
      expect(
        (theirs.body as VisitChangePage).items.map((c) => c.action),
      ).toEqual(['UPDATED']);
    });

    it('filters by the day of the change in Warsaw', async () => {
      const s = await salonWithVisitData();
      // 23:30 on 30.09 and 00:30 on 1.10 in Warsaw.
      const late = await addChange(s, '2026-09-30T21:30:00Z');
      const early = await addChange(s, '2026-09-30T22:30:00Z');

      const res = await s.asOwner
        .get(CHANGES)
        .query({ clientId: s.client.id, day: '2026-10-01' })
        .expect(200);

      const ids = (res.body as VisitChangePage).items.map((c) => c.id);
      expect(ids).toEqual([early.id]);
      expect(ids).not.toContain(late.id);
    });

    it('filters by who made the change', async () => {
      const s = await salonWithVisitData();
      await addChange(s, '2026-09-30T10:00:00Z', { staffMemberId: s.owner.id });
      const theirs = await addChange(s, '2026-09-30T11:00:00Z', {
        staffMemberId: s.person.id,
      });

      const res = await s.asOwner
        .get(CHANGES)
        .query({ clientId: s.client.id, staffId: s.person.id })
        .expect(200);

      expect((res.body as VisitChangePage).items.map((c) => c.id)).toEqual([
        theirs.id,
      ]);
    });

    it('pages by VISIT_CHANGES_PAGE_SIZE', async () => {
      const s = await salonWithVisitData();
      for (let i = 0; i <= VISIT_CHANGES_PAGE_SIZE; i++) {
        await addChange(s, new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString());
      }

      const second = await s.asOwner
        .get(CHANGES)
        .query({ clientId: s.client.id, page: 2 })
        .expect(200);

      expect(second.body).toMatchObject({
        page: 2,
        total: VISIT_CHANGES_PAGE_SIZE + 1,
      });
      expect(second.body.items).toHaveLength(1);
      // The oldest is last.
      expect(second.body.items[0].at).toBe('2026-09-01T00:00:00.000Z');
    });

    it.each([
      { day: '2026-02-30' },
      { staffId: 'kasia' },
      { clientId: 'anna' },
      { page: 0 },
      { page: 'dwa' },
    ])('answers 400 for %j', async (query) => {
      const s = await salonWithVisitData();

      const res = await s.asOwner.get(CHANGES).query(query).expect(400);

      expect(res.body.message).toBe(VISIT_CHANGE_QUERY_INVALID);
    });

    it('answers 403 to a Pracownik', async () => {
      const s = await salonWithVisitData();

      await s.asEmployee.get(CHANGES).expect(403);
    });
  });

  describe('deleting a Klient', () => {
    it('removes their name from the Historia zmian', async () => {
      const s = await salonWithVisitData();
      const visit = await createVisit(s, '2020-10-05T14:00:00+02:00');

      await s.asOwner.delete(`/api/clients/${s.client.id}`).expect(204);

      const [created] = await changesOf(visit.id);
      expect(created.after).toMatchObject({
        clientId: s.client.id,
        clientName: DELETED_CLIENT_NAME,
      });
    });
  });
});

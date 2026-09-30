import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  VISIT_BREAK_INVALID,
  VISIT_CLIENT_UNAVAILABLE,
  VISIT_COLLISION,
  VISIT_DESCRIPTION_REQUIRED,
  VISIT_DURATION_INVALID,
  VISIT_SERVICE_UNAVAILABLE,
  VISIT_STAFF_UNAVAILABLE,
  VISIT_STATE_CHANGE_INVALID,
  VisitView,
} from '@bookit/shared';
import { hash } from 'argon2';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';

const PASSWORD = 'correct horse battery staple';
const URL = '/api/visits';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Wizyty', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  let app: INestApplication;
  let passwordHash: string;

  const unique = () => randomUUID().slice(0, 8);

  async function logIn(salonId: string, role: 'OWNER' | 'EMPLOYEE') {
    const email = `visits-${unique()}@bookit.test`;
    const user = await raw.user.create({ data: { email, passwordHash } });
    const staffMember = await raw.staffMember.create({
      data: { salonId, userId: user.id, role, displayName: role },
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

  function addPerson(salonId: string, displayName: string) {
    return raw.staffMember.create({
      data: { salonId, role: 'EMPLOYEE', displayName },
    });
  }

  function addCategory(salonId: string) {
    return raw.serviceCategory.create({
      data: { salonId, name: `Strzyżenie ${unique()}` },
    });
  }

  function addService(
    salonId: string,
    categoryId: string,
    name: string,
    fields: { priceGrosze?: number; archivedAt?: Date } = {},
  ) {
    return raw.service.create({
      data: {
        salonId,
        categoryId,
        name,
        priceGrosze: 8000,
        priceType: 'FIXED',
        durationMin: 60,
        ...fields,
      },
    });
  }

  /**
   * The logged-in Właściciel and Pracownik, and for this test alone: a person without an
   * account whose calendar it fills, a colleague of theirs, a Klient and a Usługa.
   */
  async function salonWithStaff() {
    const { salon } = team;
    const person = await addPerson(salon.id, 'Anna');
    const colleague = await addPerson(salon.id, 'Ewa');
    const client = await addClient(salon.id, 'Łucja Nowak');
    const category = await addCategory(salon.id);
    const service = await addService(
      salon.id,
      category.id,
      'Strzyżenie damskie',
    );
    return {
      salon,
      owner: team.owner.staffMember,
      employee: team.employee.staffMember,
      asOwner: team.owner.agent,
      asEmployee: team.employee.agent,
      person,
      colleague,
      client,
      service,
      addService: (
        name: string,
        fields: { priceGrosze?: number; archivedAt?: Date } = {},
      ) => addService(salon.id, category.id, name, fields),
    };
  }

  /** Another Salon, with a person, a Klient, a Usługa and a Wizyta. */
  async function otherSalon() {
    const salon = await raw.salon.create({
      data: { name: `Studio ${unique()}`, slug: `wizyty-${unique()}` },
    });
    const person = await addPerson(salon.id, 'Ola');
    const client = await addClient(salon.id, 'Maria Kowalska');
    const category = await addCategory(salon.id);
    const service = await addService(salon.id, category.id, 'Manicure');
    const visit = await raw.visit.create({
      data: {
        salonId: salon.id,
        staffMemberId: person.id,
        clientId: client.id,
        startsAt: new Date('2026-10-05T10:00:00+02:00'),
        durationMin: 60,
        description: 'Manicure',
        createdById: person.id,
        updatedById: person.id,
      },
    });
    return { person, client, service, visit };
  }

  function addClient(salonId: string, name: string, deletedAt?: Date) {
    return raw.client.create({
      data: { salonId, name, nameNormalized: name.toLowerCase(), deletedAt },
    });
  }

  type Salon = Awaited<ReturnType<typeof salonWithStaff>>;

  /** A valid body: the person of the test, Monday 10:00–11:00 with the Usługa. */
  const body = (s: Salon, fields: Record<string, unknown> = {}) => ({
    staffMemberId: s.person.id,
    clientId: s.client.id,
    startsAt: '2026-10-05T10:00:00+02:00',
    durationMin: 60,
    breakMin: 0,
    serviceIds: [s.service.id],
    description: null,
    ...fields,
  });

  async function createVisit(s: Salon, fields: Record<string, unknown> = {}) {
    const res = await s.asEmployee.post(URL).send(body(s, fields)).expect(201);
    return res.body as VisitView;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    passwordHash = await hash(PASSWORD);
    const salon = await raw.salon.create({
      data: { name: `Studio ${unique()}`, slug: `wizyty-${unique()}` },
    });
    team = {
      salon,
      owner: await logIn(salon.id, 'OWNER'),
      employee: await logIn(salon.id, 'EMPLOYEE'),
    };
  });

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  describe('POST /api/visits', () => {
    it('saves the Wizyta with a snapshot of its Usługi', async () => {
      const s = await salonWithStaff();

      const res = await s.asEmployee
        .post(URL)
        .send(body(s, { breakMin: 15, description: '  Grzywka  ' }))
        .expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        staffMemberId: s.person.id,
        clientId: s.client.id,
        startsAt: '2026-10-05T08:00:00.000Z',
        durationMin: 60,
        breakMin: 15,
        description: 'Grzywka',
        state: 'SCHEDULED',
        services: [
          {
            serviceId: s.service.id,
            name: 'Strzyżenie damskie',
            priceGrosze: 8000,
            priceType: 'FIXED',
          },
        ],
        createdById: s.employee.id,
        updatedById: s.employee.id,
      });
      const saved = await raw.visit.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(saved.salonId).toBe(s.salon.id);
    });

    it('saves a Wizyta without Usługi when it has a description', async () => {
      const s = await salonWithStaff();

      const res = await s.asOwner
        .post(URL)
        .send(body(s, { serviceIds: [], description: 'Konsultacja' }))
        .expect(201);

      expect(res.body).toMatchObject({
        services: [],
        description: 'Konsultacja',
        createdById: s.owner.id,
      });
    });

    it.each([
      { description: null },
      { description: '   ' },
      { description: undefined },
    ])('answers 422 with no Usługi and %j', async (fields) => {
      const s = await salonWithStaff();

      const res = await s.asEmployee
        .post(URL)
        .send(body(s, { serviceIds: [], ...fields }))
        .expect(422);

      expect(res.body.message).toBe(VISIT_DESCRIPTION_REQUIRED);
    });

    it.each([0, 3, 605, 62, 610])(
      'answers 422 for a Czas trwania of %i min',
      async (durationMin) => {
        const s = await salonWithStaff();
        const res = await s.asEmployee
          .post(URL)
          .send(body(s, { durationMin }))
          .expect(422);
        expect(res.body.message).toBe(VISIT_DURATION_INVALID);
      },
    );

    it.each([-5, 7, 125])(
      'answers 422 for a Przerwa of %i min',
      async (breakMin) => {
        const s = await salonWithStaff();
        const res = await s.asEmployee
          .post(URL)
          .send(body(s, { breakMin }))
          .expect(422);
        expect(res.body.message).toBe(VISIT_BREAK_INVALID);
      },
    );

    it.each([
      ['not a date', 'jutro'],
      ['a date without an offset', '2026-10-05T10:00:00'],
    ])('answers 400 for startsAt that is %s', async (_, startsAt) => {
      const s = await salonWithStaff();
      await s.asEmployee.post(URL).send(body(s, { startsAt })).expect(400);
    });

    it('answers 422 for a person who does not accept Wizyty', async () => {
      const s = await salonWithStaff();
      await raw.staffMember.update({
        where: { id: s.person.id },
        data: { acceptsVisits: false },
      });

      const res = await s.asOwner.post(URL).send(body(s)).expect(422);

      expect(res.body.message).toBe(VISIT_STAFF_UNAVAILABLE);
    });

    it('answers 422 for a deleted person', async () => {
      const s = await salonWithStaff();
      const gone = await raw.staffMember.create({
        data: {
          salonId: s.salon.id,
          role: 'EMPLOYEE',
          displayName: 'Ewa',
          deletedAt: new Date(),
        },
      });

      const res = await s.asOwner
        .post(URL)
        .send(body(s, { staffMemberId: gone.id }))
        .expect(422);

      expect(res.body.message).toBe(VISIT_STAFF_UNAVAILABLE);
    });

    it('answers 422 for a person of another Salon', async () => {
      const s = await salonWithStaff();
      const other = await otherSalon();

      const res = await s.asOwner
        .post(URL)
        .send(body(s, { staffMemberId: other.person.id }))
        .expect(422);

      expect(res.body.message).toBe(VISIT_STAFF_UNAVAILABLE);
    });

    it('answers 422 for an archived Usługa', async () => {
      const s = await salonWithStaff();
      const archived = await s.addService('Trwała', { archivedAt: new Date() });

      const res = await s.asEmployee
        .post(URL)
        .send(body(s, { serviceIds: [s.service.id, archived.id] }))
        .expect(422);

      expect(res.body.message).toBe(VISIT_SERVICE_UNAVAILABLE);
    });

    it('answers 422 for a Usługa of another Salon', async () => {
      const s = await salonWithStaff();
      const other = await otherSalon();

      const res = await s.asEmployee
        .post(URL)
        .send(body(s, { serviceIds: [other.service.id] }))
        .expect(422);

      expect(res.body.message).toBe(VISIT_SERVICE_UNAVAILABLE);
    });

    it('answers 422 for a deleted Klient', async () => {
      const s = await salonWithStaff();
      const gone = await addClient(s.salon.id, 'Klient usunięty', new Date());

      const res = await s.asEmployee
        .post(URL)
        .send(body(s, { clientId: gone.id }))
        .expect(422);

      expect(res.body.message).toBe(VISIT_CLIENT_UNAVAILABLE);
    });

    it('answers 422 for a Klient of another Salon', async () => {
      const s = await salonWithStaff();
      const other = await otherSalon();

      const res = await s.asEmployee
        .post(URL)
        .send(body(s, { clientId: other.client.id }))
        .expect(422);

      expect(res.body.message).toBe(VISIT_CLIENT_UNAVAILABLE);
    });

    it('answers 409 with the Kolizje, and saves them with acceptCollisions', async () => {
      const s = await salonWithStaff();
      const first = await createVisit(s, { breakMin: 15 });
      const absence = await raw.absence.create({
        data: {
          salonId: s.salon.id,
          staffMemberId: s.person.id,
          startsAt: new Date('2026-10-05T11:00:00+02:00'),
          endsAt: new Date('2026-10-05T18:00:00+02:00'),
          reason: 'Lekarz',
        },
      });
      const second = body(s, { startsAt: '2026-10-05T10:30:00+02:00' });

      const res = await s.asEmployee.post(URL).send(second).expect(409);

      expect(res.body).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: VISIT_COLLISION,
        collisions: [
          {
            type: 'visit',
            id: first.id,
            startsAt: '2026-10-05T08:00:00.000Z',
            endsAt: '2026-10-05T09:15:00.000Z',
            label: 'Łucja Nowak',
          },
          {
            type: 'absence',
            id: absence.id,
            startsAt: '2026-10-05T09:00:00.000Z',
            endsAt: '2026-10-05T16:00:00.000Z',
            label: 'Lekarz',
          },
        ],
      });
      expect(
        await raw.visit.count({ where: { staffMemberId: s.person.id } }),
      ).toBe(1);

      await s.asEmployee
        .post(URL)
        .send({ ...second, acceptCollisions: true })
        .expect(201);
      expect(
        await raw.visit.count({ where: { staffMemberId: s.person.id } }),
      ).toBe(2);
    });

    it('labels a Nieobecność without a reason', async () => {
      const s = await salonWithStaff();
      await raw.absence.create({
        data: {
          salonId: s.salon.id,
          staffMemberId: s.person.id,
          startsAt: new Date('2026-10-05T00:00:00+02:00'),
          endsAt: new Date('2026-10-06T00:00:00+02:00'),
        },
      });

      const res = await s.asEmployee.post(URL).send(body(s)).expect(409);

      expect(res.body.collisions).toEqual([
        expect.objectContaining({ type: 'absence', label: 'Nieobecność' }),
      ]);
    });

    it('is no Kolizja to touch another Wizyta, or overlap one of another person or a cancelled one', async () => {
      const s = await salonWithStaff();
      await createVisit(s, { startsAt: '2026-10-05T09:00:00+02:00' });
      await createVisit(s, { staffMemberId: s.colleague.id });
      const cancelled = await createVisit(s, {
        startsAt: '2026-10-05T10:15:00+02:00',
        acceptCollisions: true,
      });
      await s.asEmployee.post(`${URL}/${cancelled.id}/cancel`).expect(200);

      await s.asEmployee.post(URL).send(body(s)).expect(201);
    });

    it('saves a Wizyta outside the Godziny otwarcia and on an Święto without a warning', async () => {
      const s = await salonWithStaff();
      await raw.openingHours.create({
        data: {
          salonId: s.salon.id,
          weekday: 3,
          opensAt: new Date('1970-01-01T09:00:00Z'),
          closesAt: new Date('1970-01-01T17:00:00Z'),
        },
      });

      // Sunday, closed, at 22:00
      await s.asEmployee
        .post(URL)
        .send(body(s, { startsAt: '2026-10-04T22:00:00+02:00' }))
        .expect(201);
      // 11 November, Narodowe Święto Niepodległości, a Wednesday, before opening
      await s.asEmployee
        .post(URL)
        .send(body(s, { startsAt: '2026-11-11T06:00:00+01:00' }))
        .expect(201);
    });
  });

  describe('PATCH /api/visits/:id', () => {
    it('keeps the snapshot of a kept Usługa and takes the current Cena for a new one', async () => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);
      const colouring = await s.addService('Koloryzacja', {
        priceGrosze: 20000,
      });
      await raw.service.updateMany({
        where: { id: { in: [s.service.id, colouring.id] } },
        data: { priceGrosze: 9900, name: 'Nowa nazwa' },
      });

      const res = await s.asOwner
        .patch(`${URL}/${visit.id}`)
        .send({ serviceIds: [colouring.id, s.service.id] })
        .expect(200);

      expect(res.body.services).toEqual(
        expect.arrayContaining([
          {
            serviceId: s.service.id,
            name: 'Strzyżenie damskie',
            priceGrosze: 8000,
            priceType: 'FIXED',
          },
          {
            serviceId: colouring.id,
            name: 'Nowa nazwa',
            priceGrosze: 9900,
            priceType: 'FIXED',
          },
        ]),
      );
      expect(res.body.services).toHaveLength(2);
      expect(res.body.updatedById).toBe(s.owner.id);
      expect(res.body.createdById).toBe(s.employee.id);
    });

    it('does not change priceGroszeSnapshot when the Cena of the Usługa changes', async () => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);

      await s.asOwner
        .patch(`/api/services/${s.service.id}`)
        .send({ priceGrosze: 12000 })
        .expect(200);

      const saved = await raw.visitService.findFirstOrThrow({
        where: { visitId: visit.id },
      });
      expect(saved.priceGroszeSnapshot).toBe(8000);
    });

    it('removes a Usługa left out of serviceIds', async () => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);

      const res = await s.asEmployee
        .patch(`${URL}/${visit.id}`)
        .send({ serviceIds: [], description: 'Tylko konsultacja' })
        .expect(200);

      expect(res.body.services).toEqual([]);
      expect(
        await raw.visitService.count({ where: { visitId: visit.id } }),
      ).toBe(0);
    });

    it('keeps an Usługa archived after it was added', async () => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);
      await raw.service.update({
        where: { id: s.service.id },
        data: { archivedAt: new Date() },
      });

      await s.asEmployee
        .patch(`${URL}/${visit.id}`)
        .send({ serviceIds: [s.service.id], durationMin: 90 })
        .expect(200);
    });

    it('answers 422 for adding an archived Usługa', async () => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);
      const archived = await s.addService('Trwała', { archivedAt: new Date() });

      const res = await s.asEmployee
        .patch(`${URL}/${visit.id}`)
        .send({ serviceIds: [s.service.id, archived.id] })
        .expect(422);

      expect(res.body.message).toBe(VISIT_SERVICE_UNAVAILABLE);
    });

    it('answers 422 for removing the last Usługa of a Wizyta without a description', async () => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);

      const res = await s.asEmployee
        .patch(`${URL}/${visit.id}`)
        .send({ serviceIds: [] })
        .expect(422);

      expect(res.body.message).toBe(VISIT_DESCRIPTION_REQUIRED);
    });

    it('lets a Wizyta of a deleted person be edited, but not moved to one', async () => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);
      await raw.staffMember.update({
        where: { id: s.person.id },
        data: { deletedAt: new Date(), acceptsVisits: false },
      });

      await s.asOwner
        .patch(`${URL}/${visit.id}`)
        .send({ description: 'Grzywka', staffMemberId: s.person.id })
        .expect(200);
      await s.asOwner
        .patch(`${URL}/${visit.id}`)
        .send({ staffMemberId: s.colleague.id })
        .expect(200);
      const res = await s.asOwner
        .patch(`${URL}/${visit.id}`)
        .send({ staffMemberId: s.person.id })
        .expect(422);
      expect(res.body.message).toBe(VISIT_STAFF_UNAVAILABLE);
    });

    it('answers 422 for moving the Wizyta to a deleted Klient', async () => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);
      const gone = await addClient(s.salon.id, 'Klient usunięty', new Date());

      const res = await s.asEmployee
        .patch(`${URL}/${visit.id}`)
        .send({ clientId: gone.id })
        .expect(422);

      expect(res.body.message).toBe(VISIT_CLIENT_UNAVAILABLE);
    });

    it('answers 409 for moving onto another Wizyta, and saves with acceptCollisions', async () => {
      const s = await salonWithStaff();
      const first = await createVisit(s);
      const second = await createVisit(s, {
        startsAt: '2026-10-05T12:00:00+02:00',
      });

      const res = await s.asEmployee
        .patch(`${URL}/${second.id}`)
        .send({ startsAt: '2026-10-05T10:30:00+02:00' })
        .expect(409);
      expect(res.body.collisions).toEqual([
        expect.objectContaining({ type: 'visit', id: first.id }),
      ]);

      const saved = await s.asEmployee
        .patch(`${URL}/${second.id}`)
        .send({ startsAt: '2026-10-05T10:30:00+02:00', acceptCollisions: true })
        .expect(200);
      expect(saved.body.startsAt).toBe('2026-10-05T08:30:00.000Z');
    });

    it('is no Kolizja with itself', async () => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);

      await s.asEmployee
        .patch(`${URL}/${visit.id}`)
        .send({ durationMin: 90, breakMin: 10 })
        .expect(200);
    });

    it('checks Kolizje when only the Przerwa grows into the next Wizyta', async () => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);
      await createVisit(s, { startsAt: '2026-10-05T11:00:00+02:00' });

      await s.asEmployee
        .patch(`${URL}/${visit.id}`)
        .send({ breakMin: 5 })
        .expect(409);
    });

    it('does not check Kolizje when neither the time nor the person changes', async () => {
      const s = await salonWithStaff();
      await createVisit(s);
      const overlapping = await createVisit(s, {
        startsAt: '2026-10-05T10:30:00+02:00',
        acceptCollisions: true,
      });

      await s.asEmployee
        .patch(`${URL}/${overlapping.id}`)
        .send({ description: 'Grzywka' })
        .expect(200);
    });

    it('answers 404 for a Wizyta of another Salon', async () => {
      const s = await salonWithStaff();
      const other = await otherSalon();
      const visit = other.visit;

      await s.asEmployee
        .patch(`${URL}/${visit.id}`)
        .send({ durationMin: 30 })
        .expect(404);
    });
  });

  describe('Stan Wizyty', () => {
    it.each([
      ['cancel', 'CANCELLED'],
      ['no-show', 'NO_SHOW'],
    ])('/%s makes a scheduled Wizyta %s', async (action, state) => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);

      const res = await s.asOwner
        .post(`${URL}/${visit.id}/${action}`)
        .expect(200);

      expect(res.body).toMatchObject({ state, updatedById: s.owner.id });
    });

    it.each([
      ['cancel', 'CANCELLED'],
      ['cancel', 'NO_SHOW'],
      ['no-show', 'CANCELLED'],
      ['no-show', 'NO_SHOW'],
    ])('/%s answers 422 for a %s Wizyta', async (action, state) => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);
      await raw.visit.update({
        where: { id: visit.id },
        data: { state: state as 'CANCELLED' | 'NO_SHOW' },
      });

      const res = await s.asEmployee
        .post(`${URL}/${visit.id}/${action}`)
        .expect(422);

      expect(res.body.message).toBe(VISIT_STATE_CHANGE_INVALID);
    });

    it.each(['cancel', 'no-show'])(
      '/restore brings back a Wizyta after /%s',
      async (action) => {
        const s = await salonWithStaff();
        const visit = await createVisit(s);
        await s.asEmployee.post(`${URL}/${visit.id}/${action}`).expect(200);

        const res = await s.asEmployee
          .post(`${URL}/${visit.id}/restore`)
          .expect(200);

        expect(res.body.state).toBe('SCHEDULED');
      },
    );

    it('/restore answers 422 for a scheduled Wizyta', async () => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);

      const res = await s.asEmployee
        .post(`${URL}/${visit.id}/restore`)
        .expect(422);

      expect(res.body.message).toBe(VISIT_STATE_CHANGE_INVALID);
    });

    it('/restore answers 409 when the time was taken meanwhile, and restores with acceptCollisions', async () => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);
      await s.asEmployee.post(`${URL}/${visit.id}/cancel`).expect(200);
      const other = await createVisit(s);

      const res = await s.asEmployee
        .post(`${URL}/${visit.id}/restore`)
        .expect(409);
      expect(res.body.collisions).toEqual([
        expect.objectContaining({ type: 'visit', id: other.id }),
      ]);

      await s.asEmployee
        .post(`${URL}/${visit.id}/restore`)
        .send({ acceptCollisions: true })
        .expect(200);
    });

    it('answers 404 for an unknown Wizyta', async () => {
      const s = await salonWithStaff();
      await s.asEmployee.post(`${URL}/${UNKNOWN_ID}/cancel`).expect(404);
    });
  });

  describe('DELETE /api/visits/:id', () => {
    it('deletes the Wizyta with its Usługi', async () => {
      const s = await salonWithStaff();
      const visit = await createVisit(s);

      await s.asEmployee.delete(`${URL}/${visit.id}`).expect(204);

      expect(await raw.visit.findUnique({ where: { id: visit.id } })).toBe(
        null,
      );
      expect(
        await raw.visitService.count({ where: { visitId: visit.id } }),
      ).toBe(0);
    });

    it('answers 404 for a Wizyta of another Salon', async () => {
      const s = await salonWithStaff();
      const other = await otherSalon();
      const visit = other.visit;

      await s.asEmployee.delete(`${URL}/${visit.id}`).expect(404);
      expect(await raw.visit.findUnique({ where: { id: visit.id } })).not.toBe(
        null,
      );
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  ABSENCE_ENDS_AT_INVALID,
  ABSENCE_ENDS_BEFORE_START,
  ABSENCE_REASON_MAX_LENGTH,
  ABSENCE_REASON_TOO_LONG,
  ABSENCE_STAFF_UNAVAILABLE,
  AbsenceView,
  VISIT_COLLISION,
  warsawDayBounds,
} from '@bookit/shared';
import { hash } from 'argon2';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';

const PASSWORD = 'correct horse battery staple';
const URL = '/api/absences';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Nieobecności', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  let app: INestApplication;
  let passwordHash: string;

  const unique = () => randomUUID().slice(0, 8);

  async function logIn(salonId: string, role: 'OWNER' | 'EMPLOYEE') {
    const email = `absences-${unique()}@bookit.test`;
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

  function addPerson(salonId: string, displayName: string, deletedAt?: Date) {
    return raw.staffMember.create({
      data: { salonId, role: 'EMPLOYEE', displayName, deletedAt },
    });
  }

  /** A person without an account whose calendar this test alone fills. */
  const addAnna = () => addPerson(team.salon.id, 'Anna');

  /** A valid body: Anna, Monday 10:00–14:00. */
  const body = (
    staffMemberId: string,
    fields: Record<string, unknown> = {},
  ) => ({
    staffMemberId,
    startsAt: '2026-10-05T10:00:00+02:00',
    endsAt: '2026-10-05T14:00:00+02:00',
    reason: 'Lekarz',
    ...fields,
  });

  async function createAbsence(
    staffMemberId: string,
    fields: Record<string, unknown> = {},
  ) {
    const res = await team.employee.agent
      .post(URL)
      .send(body(staffMemberId, fields))
      .expect(201);
    return res.body as AbsenceView;
  }

  /** A Nieobecność of a person in another Salon. */
  async function otherSalonAbsence() {
    const salon = await raw.salon.create({
      data: { name: `Studio ${unique()}`, slug: `nieobecnosci-${unique()}` },
    });
    const person = await addPerson(salon.id, 'Ola');
    const absence = await raw.absence.create({
      data: {
        salonId: salon.id,
        staffMemberId: person.id,
        startsAt: new Date('2026-10-05T10:00:00+02:00'),
        endsAt: new Date('2026-10-05T14:00:00+02:00'),
      },
    });
    return { person, absence };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    passwordHash = await hash(PASSWORD);
    const salon = await raw.salon.create({
      data: { name: `Studio ${unique()}`, slug: `nieobecnosci-${unique()}` },
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

  describe('POST /api/absences', () => {
    it('saves the Nieobecność in the Salon', async () => {
      const anna = await addAnna();

      const res = await team.employee.agent
        .post(URL)
        .send(body(anna.id, { reason: '  Lekarz  ' }))
        .expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        staffMemberId: anna.id,
        startsAt: '2026-10-05T08:00:00.000Z',
        endsAt: '2026-10-05T12:00:00.000Z',
        reason: 'Lekarz',
      });
      const saved = await raw.absence.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(saved.salonId).toBe(team.salon.id);
    });

    it('lets any person enter one for a colleague or for themselves', async () => {
      const anna = await addAnna();

      await team.owner.agent.post(URL).send(body(anna.id)).expect(201);
      await team.employee.agent
        .post(URL)
        .send(body(team.employee.staffMember.id))
        .expect(201);
    });

    it('saves whole days from 24 to 26 October 2026 across the clock change', async () => {
      const anna = await addAnna();

      const absence = await createAbsence(anna.id, {
        startsAt: warsawDayBounds('2026-10-24').startsAt.toISOString(),
        endsAt: warsawDayBounds('2026-10-26').endsAt.toISOString(),
        reason: 'Urlop',
      });

      expect(absence).toMatchObject({
        startsAt: '2026-10-23T22:00:00.000Z',
        endsAt: '2026-10-26T23:00:00.000Z',
      });
    });

    it.each([{ reason: null }, { reason: '   ' }, { reason: undefined }])(
      'saves %j as no reason',
      async (fields) => {
        const anna = await addAnna();
        const absence = await createAbsence(anna.id, fields);
        expect(absence.reason).toBeNull();
      },
    );

    it.each([
      ['equal to', '2026-10-05T10:00:00+02:00'],
      ['before', '2026-10-05T09:00:00+02:00'],
    ])('answers 422 for endsAt %s startsAt', async (_, endsAt) => {
      const anna = await addAnna();

      const res = await team.employee.agent
        .post(URL)
        .send(body(anna.id, { endsAt }))
        .expect(422);

      expect(res.body.message).toBe(ABSENCE_ENDS_BEFORE_START);
    });

    it.each(['2026-10-05T14:00:00', 'jutro', undefined])(
      'answers 400 for endsAt %j',
      async (endsAt) => {
        const anna = await addAnna();
        const res = await team.employee.agent
          .post(URL)
          .send(body(anna.id, { endsAt }))
          .expect(400);
        expect(res.body.message).toBe(ABSENCE_ENDS_AT_INVALID);
      },
    );

    it('answers 400 for a reason too long', async () => {
      const anna = await addAnna();

      const res = await team.employee.agent
        .post(URL)
        .send(
          body(anna.id, { reason: 'x'.repeat(ABSENCE_REASON_MAX_LENGTH + 1) }),
        )
        .expect(400);

      expect(res.body.message).toBe(ABSENCE_REASON_TOO_LONG);
    });

    it('answers 422 for a deleted person or one of another Salon', async () => {
      const deleted = await addPerson(team.salon.id, 'Ewa', new Date());
      const { person: other } = await otherSalonAbsence();

      for (const staffMemberId of [deleted.id, other.id, UNKNOWN_ID]) {
        const res = await team.employee.agent
          .post(URL)
          .send(body(staffMemberId))
          .expect(422);
        expect(res.body.message).toBe(ABSENCE_STAFF_UNAVAILABLE);
      }
    });

    it('is a Kolizja for a Wizyta of the same person', async () => {
      const anna = await addAnna();
      const absence = await createAbsence(anna.id);
      const client = await raw.client.create({
        data: {
          salonId: team.salon.id,
          name: 'Łucja',
          nameNormalized: 'łucja',
        },
      });

      const res = await team.employee.agent
        .post('/api/visits')
        .send({
          staffMemberId: anna.id,
          clientId: client.id,
          startsAt: '2026-10-05T13:30:00+02:00',
          durationMin: 60,
          description: 'Konsultacja',
        })
        .expect(409);

      expect(res.body).toMatchObject({
        message: VISIT_COLLISION,
        collisions: [{ type: 'absence', id: absence.id, label: 'Lekarz' }],
      });
    });
  });

  describe('PATCH /api/absences/:id', () => {
    it('changes only the fields sent', async () => {
      const anna = await addAnna();
      const absence = await createAbsence(anna.id);

      const res = await team.owner.agent
        .patch(`${URL}/${absence.id}`)
        .send({ endsAt: '2026-10-05T16:00:00+02:00', reason: 'L4' })
        .expect(200);

      expect(res.body).toEqual({
        ...absence,
        endsAt: '2026-10-05T14:00:00.000Z',
        reason: 'L4',
      });
    });

    it('moves the Nieobecność to another person', async () => {
      const anna = await addAnna();
      const ewa = await addPerson(team.salon.id, 'Ewa');
      const absence = await createAbsence(anna.id);

      const res = await team.employee.agent
        .patch(`${URL}/${absence.id}`)
        .send({ staffMemberId: ewa.id })
        .expect(200);

      expect(res.body.staffMemberId).toBe(ewa.id);
    });

    it('answers 422 when the change puts endsAt before startsAt', async () => {
      const anna = await addAnna();
      const absence = await createAbsence(anna.id);

      const res = await team.employee.agent
        .patch(`${URL}/${absence.id}`)
        .send({ startsAt: '2026-10-05T15:00:00+02:00' })
        .expect(422);

      expect(res.body.message).toBe(ABSENCE_ENDS_BEFORE_START);
    });

    it('answers 422 for moving it to a deleted person', async () => {
      const anna = await addAnna();
      const deleted = await addPerson(team.salon.id, 'Ewa', new Date());
      const absence = await createAbsence(anna.id);

      const res = await team.employee.agent
        .patch(`${URL}/${absence.id}`)
        .send({ staffMemberId: deleted.id })
        .expect(422);

      expect(res.body.message).toBe(ABSENCE_STAFF_UNAVAILABLE);
    });

    it('answers 404 for a Nieobecność of another Salon', async () => {
      const { absence } = await otherSalonAbsence();

      await team.owner.agent
        .patch(`${URL}/${absence.id}`)
        .send({ reason: 'Urlop' })
        .expect(404);

      const kept = await raw.absence.findUniqueOrThrow({
        where: { id: absence.id },
      });
      expect(kept.reason).toBeNull();
    });
  });

  describe('DELETE /api/absences/:id', () => {
    it('deletes the Nieobecność', async () => {
      const anna = await addAnna();
      const absence = await createAbsence(anna.id);

      await team.employee.agent.delete(`${URL}/${absence.id}`).expect(204);

      expect(
        await raw.absence.findUnique({ where: { id: absence.id } }),
      ).toBeNull();
    });

    it('answers 404 for a Nieobecność of another Salon', async () => {
      const { absence } = await otherSalonAbsence();

      await team.owner.agent.delete(`${URL}/${absence.id}`).expect(404);

      expect(
        await raw.absence.findUnique({ where: { id: absence.id } }),
      ).not.toBeNull();
    });
  });
});

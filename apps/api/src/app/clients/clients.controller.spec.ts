import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  CLIENT_NAME_MAX_LENGTH,
  CLIENT_NAME_REQUIRED,
  CLIENT_NAME_TOO_LONG,
  CLIENT_NOTES_MAX_LENGTH,
  CLIENT_NOTES_TOO_LONG,
  CLIENT_PHONE_TAKEN,
  CLIENT_SEARCH_LIMIT,
  ClientView,
  DELETED_CLIENT_NAME,
  PHONE_INVALID,
} from '@bookit/shared';
import { hash } from 'argon2';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';

const PASSWORD = 'correct horse battery staple';
const URL = '/api/clients';

describe('Kartoteka Klientów', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  let app: INestApplication;
  let passwordHash: string;

  const unique = () => randomUUID().slice(0, 8);
  /** A valid Polish mobile number no other test uses. */
  const uniquePhone = () =>
    `+48${5 + Math.floor(Math.random() * 3)}${String(
      Math.floor(Math.random() * 1e8),
    ).padStart(8, '0')}`;

  async function logIn(salonId: string, role: 'OWNER' | 'EMPLOYEE') {
    const email = `clients-${unique()}@bookit.test`;
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

  async function salonWithStaff() {
    const salon = await raw.salon.create({
      data: { name: `Studio ${unique()}`, slug: `klienci-${unique()}` },
    });
    const owner = await logIn(salon.id, 'OWNER');
    const employee = await logIn(salon.id, 'EMPLOYEE');
    return {
      salon,
      owner: owner.staffMember,
      asOwner: owner.agent,
      asEmployee: employee.agent,
    };
  }

  function addClient(
    salonId: string,
    name: string,
    fields: { phoneE164?: string; notes?: string; deletedAt?: Date } = {},
  ) {
    return raw.client.create({
      data: {
        salonId,
        name,
        nameNormalized: name.toLowerCase(),
        ...fields,
      },
    });
  }

  function addVisit(
    salonId: string,
    staffMemberId: string,
    clientId: string,
    startsAt: Date,
    state: 'SCHEDULED' | 'CANCELLED' = 'SCHEDULED',
  ) {
    return raw.visit.create({
      data: {
        salonId,
        staffMemberId,
        clientId,
        startsAt,
        durationMin: 60,
        state,
        description: 'Strzyżenie',
        createdById: staffMemberId,
        updatedById: staffMemberId,
      },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    passwordHash = await hash(PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  describe('POST /api/clients', () => {
    it.each(['600 100 200', '+48600100200', '0048 600-100-200'])(
      'saves %j as +48600100200',
      async (phone) => {
        const { asEmployee } = await salonWithStaff();

        const res = await asEmployee
          .post(URL)
          .send({ name: '  Łucja  Nowak ', phone, notes: ' Lubi kawę ' })
          .expect(201);

        expect(res.body).toEqual({
          id: expect.any(String),
          name: 'Łucja  Nowak',
          phoneE164: '+48600100200',
          notes: 'Lubi kawę',
        });
        const saved = await raw.client.findUniqueOrThrow({
          where: { id: res.body.id },
        });
        expect(saved.nameNormalized).toBe('lucja nowak');
      },
    );

    it.each([{}, { phone: null }, { phone: '' }, { phone: '   ' }])(
      'saves a Klient without a phone: %j',
      async (fields) => {
        const { asEmployee } = await salonWithStaff();

        const res = await asEmployee
          .post(URL)
          .send({ name: 'Ola', ...fields })
          .expect(201);

        expect(res.body).toEqual({
          id: expect.any(String),
          name: 'Ola',
          phoneE164: null,
          notes: null,
        });
      },
    );

    it('answers 422 for a phone that cannot be parsed', async () => {
      const { asEmployee } = await salonWithStaff();

      const res = await asEmployee
        .post(URL)
        .send({ name: 'Ola', phone: '600 100' })
        .expect(422);

      expect(res.body.message).toBe(PHONE_INVALID);
    });

    it.each([
      [{}, CLIENT_NAME_REQUIRED],
      [{ name: '   ' }, CLIENT_NAME_REQUIRED],
      [{ name: 'a'.repeat(CLIENT_NAME_MAX_LENGTH + 1) }, CLIENT_NAME_TOO_LONG],
      [
        { name: 'Ola', notes: 'a'.repeat(CLIENT_NOTES_MAX_LENGTH + 1) },
        CLIENT_NOTES_TOO_LONG,
      ],
    ])('answers 400 for %j', async (body, message) => {
      const { asEmployee } = await salonWithStaff();

      const res = await asEmployee.post(URL).send(body).expect(400);

      expect(res.body.message).toBe(message);
    });

    it('answers 409 with the Klienci who have the phone, and saves after acceptDuplicatePhone', async () => {
      const { salon, asEmployee } = await salonWithStaff();
      const phone = uniquePhone();
      const first = await addClient(salon.id, 'Anna', { phoneE164: phone });
      await addClient(salon.id, 'Usunięta', {
        phoneE164: phone,
        deletedAt: new Date(),
      });
      const other = await salonWithStaff();
      await addClient(other.salon.id, 'Obca', { phoneE164: phone });

      const conflict = await asEmployee
        .post(URL)
        .send({ name: 'Anna 2', phone })
        .expect(409);

      expect(conflict.body).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: CLIENT_PHONE_TAKEN,
        clients: [
          { id: first.id, name: 'Anna', phoneE164: phone, notes: null },
        ],
      });
      expect(
        await raw.client.count({
          where: { salonId: salon.id, name: 'Anna 2' },
        }),
      ).toBe(0);

      const saved = await asEmployee
        .post(URL)
        .send({ name: 'Anna 2', phone, acceptDuplicatePhone: true })
        .expect(201);

      expect(saved.body.phoneE164).toBe(phone);
    });
  });

  describe('GET /api/clients', () => {
    it('finds "Łucja" by "lucja" and by a fragment of the phone, only in the own Salon', async () => {
      const { salon, asEmployee } = await salonWithStaff();
      const lucja = await addClient(salon.id, 'Łucja Kowalska', {
        phoneE164: '+48600100200',
      });
      await addClient(salon.id, 'Marta', { phoneE164: '+48700800900' });
      await addClient(salon.id, 'Łucja usunięta', { deletedAt: new Date() });
      const other = await salonWithStaff();
      await addClient(other.salon.id, 'Łucja Obca', {
        phoneE164: '+48600100200',
      });
      await raw.client.update({
        where: { id: lucja.id },
        data: { nameNormalized: 'lucja kowalska' },
      });

      const byName = await asEmployee
        .get(URL)
        .query({ q: 'lucja' })
        .expect(200);
      const byPhone = await asEmployee
        .get(URL)
        .query({ q: '600100' })
        .expect(200);

      const expected: ClientView[] = [
        {
          id: lucja.id,
          name: 'Łucja Kowalska',
          phoneE164: '+48600100200',
          notes: null,
        },
      ];
      expect(byName.body).toEqual(expected);
      expect(byPhone.body).toEqual(expected);
    });

    it('finds a Klient saved through the api by a name typed with Polish marks', async () => {
      const { asEmployee } = await salonWithStaff();
      await asEmployee.post(URL).send({ name: 'Żaneta Łęcka' }).expect(201);

      const res = await asEmployee.get(URL).query({ q: 'ŁĘCK' }).expect(200);

      expect(res.body.map((c: ClientView) => c.name)).toEqual(['Żaneta Łęcka']);
    });

    it(`lists at most ${CLIENT_SEARCH_LIMIT}, by name`, async () => {
      const { salon, asEmployee } = await salonWithStaff();
      for (let i = CLIENT_SEARCH_LIMIT + 2; i > 0; i--) {
        await addClient(salon.id, `Klient ${String(i).padStart(2, '0')}`);
      }

      const res = await asEmployee.get(URL).expect(200);

      expect(res.body).toHaveLength(CLIENT_SEARCH_LIMIT);
      expect(res.body[0].name).toBe('Klient 01');
      expect(res.body[CLIENT_SEARCH_LIMIT - 1].name).toBe(
        `Klient ${CLIENT_SEARCH_LIMIT}`,
      );
    });
  });

  describe('GET /api/clients/:id', () => {
    it('shows a Klient of the own Salon', async () => {
      const { salon, asEmployee } = await salonWithStaff();
      const client = await addClient(salon.id, 'Ola');

      await asEmployee.get(`${URL}/${client.id}`).expect(200, {
        id: client.id,
        name: 'Ola',
        phoneE164: null,
        notes: null,
      });
    });

    it('answers 404 for a Klient of another Salon or a deleted one', async () => {
      const { salon, asEmployee } = await salonWithStaff();
      const deleted = await addClient(salon.id, 'Usunięta', {
        deletedAt: new Date(),
      });
      const other = await salonWithStaff();
      const foreign = await addClient(other.salon.id, 'Obca');

      await asEmployee.get(`${URL}/${deleted.id}`).expect(404);
      await asEmployee.get(`${URL}/${foreign.id}`).expect(404);
    });
  });

  describe('PATCH /api/clients/:id', () => {
    it('changes only the given fields and keeps nameNormalized in step', async () => {
      const { salon, asEmployee } = await salonWithStaff();
      const client = await addClient(salon.id, 'Ola', {
        phoneE164: '+48600100200',
      });

      const res = await asEmployee
        .patch(`${URL}/${client.id}`)
        .send({ name: 'Łucja', notes: 'Woli rano' })
        .expect(200);

      expect(res.body).toEqual({
        id: client.id,
        name: 'Łucja',
        phoneE164: '+48600100200',
        notes: 'Woli rano',
      });
      const saved = await raw.client.findUniqueOrThrow({
        where: { id: client.id },
      });
      expect(saved.nameNormalized).toBe('lucja');
    });

    it('removes the phone and the notes with null', async () => {
      const { salon, asEmployee } = await salonWithStaff();
      const client = await addClient(salon.id, 'Ola', {
        phoneE164: '+48600100200',
      });

      const res = await asEmployee
        .patch(`${URL}/${client.id}`)
        .send({ phone: null, notes: '' })
        .expect(200);

      expect(res.body).toMatchObject({ phoneE164: null, notes: null });
    });

    it('answers 422 for a phone that cannot be parsed', async () => {
      const { salon, asEmployee } = await salonWithStaff();
      const client = await addClient(salon.id, 'Ola');

      await asEmployee
        .patch(`${URL}/${client.id}`)
        .send({ phone: 'abc' })
        .expect(422);
    });

    it('answers 409 for a phone of another Klient, and saves after acceptDuplicatePhone', async () => {
      const { salon, asEmployee } = await salonWithStaff();
      const phone = uniquePhone();
      const anna = await addClient(salon.id, 'Anna', { phoneE164: phone });
      const ola = await addClient(salon.id, 'Ola');

      const conflict = await asEmployee
        .patch(`${URL}/${ola.id}`)
        .send({ phone })
        .expect(409);
      expect(conflict.body.clients.map((c: ClientView) => c.id)).toEqual([
        anna.id,
      ]);

      await asEmployee
        .patch(`${URL}/${ola.id}`)
        .send({ phone, acceptDuplicatePhone: true })
        .expect(200);
      // The phone is already the Klient's own: editing the name does not ask again.
      await asEmployee
        .patch(`${URL}/${ola.id}`)
        .send({ name: 'Ola K.', phone })
        .expect(200);
    });

    it('does not count the Klient itself as a duplicate', async () => {
      const { salon, asEmployee } = await salonWithStaff();
      const phone = uniquePhone();
      const client = await addClient(salon.id, 'Ola', { phoneE164: phone });

      await asEmployee
        .patch(`${URL}/${client.id}`)
        .send({ phone: phone.replace('+48', '') })
        .expect(200);
    });

    it('answers 404 for a Klient of another Salon or a deleted one', async () => {
      const { salon, asEmployee } = await salonWithStaff();
      const deleted = await addClient(salon.id, 'Usunięta', {
        deletedAt: new Date(),
      });
      const other = await salonWithStaff();
      const foreign = await addClient(other.salon.id, 'Obca');

      await asEmployee
        .patch(`${URL}/${deleted.id}`)
        .send({ name: 'X' })
        .expect(404);
      await asEmployee
        .patch(`${URL}/${foreign.id}`)
        .send({ name: 'X' })
        .expect(404);
      expect(
        await raw.client.findUniqueOrThrow({ where: { id: foreign.id } }),
      ).toMatchObject({ name: 'Obca' });
    });
  });

  describe('DELETE /api/clients/:id', () => {
    it('deletes the Klient down to "Klient usunięty", keeps the past Wizyty and deletes the future scheduled ones', async () => {
      const { salon, owner, asOwner } = await salonWithStaff();
      const client = await addClient(salon.id, 'Łucja', {
        phoneE164: uniquePhone(),
        notes: 'Lubi kawę',
      });
      const hour = 60 * 60 * 1000;
      const past = await addVisit(
        salon.id,
        owner.id,
        client.id,
        new Date(Date.now() - 24 * hour),
      );
      await addVisit(
        salon.id,
        owner.id,
        client.id,
        new Date(Date.now() + 24 * hour),
      );
      const futureCancelled = await addVisit(
        salon.id,
        owner.id,
        client.id,
        new Date(Date.now() + 48 * hour),
        'CANCELLED',
      );
      const someoneElse = await addClient(salon.id, 'Marta');
      const othersFuture = await addVisit(
        salon.id,
        owner.id,
        someoneElse.id,
        new Date(Date.now() + 24 * hour),
      );

      await asOwner.delete(`${URL}/${client.id}`).expect(204);

      const saved = await raw.client.findUniqueOrThrow({
        where: { id: client.id },
      });
      expect(saved).toMatchObject({
        name: DELETED_CLIENT_NAME,
        nameNormalized: 'klient usuniety',
        phoneE164: null,
        notes: null,
        deletedAt: expect.any(Date),
      });
      const visits = await raw.visit.findMany({
        where: { salonId: salon.id },
        include: { client: true },
      });
      expect(visits.map((v) => v.id).sort()).toEqual(
        [past.id, futureCancelled.id, othersFuture.id].sort(),
      );
      expect(visits.find((v) => v.id === past.id)?.client.name).toBe(
        DELETED_CLIENT_NAME,
      );

      await asOwner.get(URL).query({ q: 'klient' }).expect(200, []);
      await asOwner.delete(`${URL}/${client.id}`).expect(404);
    });

    it('answers 404 for a Klient of another Salon', async () => {
      const { asOwner } = await salonWithStaff();
      const other = await salonWithStaff();
      const foreign = await addClient(other.salon.id, 'Obca');

      await asOwner.delete(`${URL}/${foreign.id}`).expect(404);
      expect(
        await raw.client.findUniqueOrThrow({ where: { id: foreign.id } }),
      ).toMatchObject({ name: 'Obca', deletedAt: null });
    });

    it('is only for the Właściciel', async () => {
      const { salon, asEmployee } = await salonWithStaff();
      const client = await addClient(salon.id, 'Ola');

      await asEmployee.delete(`${URL}/${client.id}`).expect(403);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  SERVICE_CATEGORY_HAS_SERVICES,
  SERVICE_CATEGORY_NAME_MAX_LENGTH,
  SERVICE_CATEGORY_ORDER_MISMATCH,
  ServiceCategoryView,
} from '@bookit/shared';
import { hash } from 'argon2';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';

const PASSWORD = 'correct horse battery staple';

describe('Kategorie Usług', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  let app: INestApplication;
  let passwordHash: string;

  const unique = () => randomUUID().slice(0, 8);

  async function logIn(email: string) {
    const client = request.agent(app.getHttpServer());
    await client
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return client;
  }

  async function addStaffMember(salonId: string, role: 'OWNER' | 'EMPLOYEE') {
    const email = `categories-${unique()}@bookit.test`;
    const user = await raw.user.create({ data: { email, passwordHash } });
    await raw.staffMember.create({
      data: { salonId, userId: user.id, role, displayName: role },
    });
    return logIn(email);
  }

  /** A Salon with a logged-in Właściciel and a logged-in Pracownik. */
  async function salonWithStaff() {
    const salon = await raw.salon.create({
      data: { name: `Studio ${unique()}`, slug: `test-${randomUUID()}` },
    });
    return {
      salon,
      asOwner: await addStaffMember(salon.id, 'OWNER'),
      asEmployee: await addStaffMember(salon.id, 'EMPLOYEE'),
    };
  }

  function addCategory(salonId: string, name: string, sortOrder = 0) {
    return raw.serviceCategory.create({ data: { salonId, name, sortOrder } });
  }

  function addService(
    salonId: string,
    categoryId: string,
    { archivedAt = null as Date | null } = {},
  ) {
    return raw.service.create({
      data: {
        salonId,
        categoryId,
        name: 'Strzyżenie damskie',
        priceGrosze: 9000,
        priceType: 'FROM',
        durationMin: 45,
        archivedAt,
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

  describe('GET /api/service-categories', () => {
    it('lists the Kategorie of the own Salon in order, to the whole Personel', async () => {
      const { salon, asOwner, asEmployee } = await salonWithStaff();
      const nails = await addCategory(salon.id, 'Paznokcie', 1);
      const hair = await addCategory(salon.id, 'Strzyżenie', 0);
      const other = await salonWithStaff();
      await addCategory(other.salon.id, 'Obca', 0);

      const res = await asOwner.get('/api/service-categories').expect(200);

      expect(res.body).toEqual([
        { id: hair.id, name: 'Strzyżenie' },
        { id: nails.id, name: 'Paznokcie' },
      ] satisfies ServiceCategoryView[]);
      const asStaff = await asEmployee
        .get('/api/service-categories')
        .expect(200);
      expect(asStaff.body).toEqual(res.body);
    });
  });

  describe('POST /api/service-categories', () => {
    it('adds the Kategoria at the end of the list', async () => {
      const { salon, asOwner } = await salonWithStaff();
      await addCategory(salon.id, 'Strzyżenie', 0);
      await addCategory(salon.id, 'Koloryzacja', 1);

      const res = await asOwner
        .post('/api/service-categories')
        .send({ name: ' Paznokcie ' })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        name: 'Paznokcie',
      } satisfies ServiceCategoryView);
      expect(
        await raw.serviceCategory.findUniqueOrThrow({
          where: { id: res.body.id },
        }),
      ).toMatchObject({ salonId: salon.id, sortOrder: 2 });
    });

    it.each([
      ['an empty name', { name: '  ' }, 'Wpisz nazwę'],
      ['no name', {}, 'Wpisz nazwę'],
      [
        'a too long name',
        { name: 'x'.repeat(SERVICE_CATEGORY_NAME_MAX_LENGTH + 1) },
        `Nazwa może mieć najwyżej ${SERVICE_CATEGORY_NAME_MAX_LENGTH} znaków`,
      ],
    ])('answers 400 for %s', async (_, body, message) => {
      const { asOwner } = await salonWithStaff();

      const res = await asOwner
        .post('/api/service-categories')
        .send(body)
        .expect(400);

      expect(res.body.message).toBe(message);
    });
  });

  describe('PATCH /api/service-categories/:id', () => {
    it('renames the Kategoria', async () => {
      const { salon, asOwner } = await salonWithStaff();
      const category = await addCategory(salon.id, 'Strzyzenie');

      const res = await asOwner
        .patch(`/api/service-categories/${category.id}`)
        .send({ name: 'Strzyżenie' })
        .expect(200);

      expect(res.body).toEqual({ id: category.id, name: 'Strzyżenie' });
    });

    it('answers 400 for an empty name and 404 for a Kategoria of another Salon', async () => {
      const { salon, asOwner } = await salonWithStaff();
      const category = await addCategory(salon.id, 'Strzyżenie');
      const other = await salonWithStaff();
      const foreign = await addCategory(other.salon.id, 'Obca');

      await asOwner
        .patch(`/api/service-categories/${category.id}`)
        .send({ name: '' })
        .expect(400);
      await asOwner
        .patch(`/api/service-categories/${foreign.id}`)
        .send({ name: 'Moja' })
        .expect(404);
      await asOwner
        .patch('/api/service-categories/not-an-id')
        .send({ name: 'X' })
        .expect(400);
      expect(
        await raw.serviceCategory.findUniqueOrThrow({
          where: { id: foreign.id },
        }),
      ).toMatchObject({ name: 'Obca' });
    });
  });

  describe('DELETE /api/service-categories/:id', () => {
    it('deletes a Kategoria without Usługi', async () => {
      const { salon, asOwner } = await salonWithStaff();
      const category = await addCategory(salon.id, 'Strzyżenie');

      await asOwner
        .delete(`/api/service-categories/${category.id}`)
        .expect(204);

      expect(
        await raw.serviceCategory.findUnique({ where: { id: category.id } }),
      ).toBeNull();
    });

    it.each([
      ['a Usługa', null],
      ['only an archived Usługa', new Date()],
    ])(
      'answers 409 and deletes nothing for a Kategoria with %s',
      async (_, archivedAt) => {
        const { salon, asOwner } = await salonWithStaff();
        const category = await addCategory(salon.id, 'Strzyżenie');
        const service = await addService(salon.id, category.id, {
          archivedAt,
        });

        const res = await asOwner
          .delete(`/api/service-categories/${category.id}`)
          .expect(409);

        expect(res.body.message).toBe(SERVICE_CATEGORY_HAS_SERVICES);
        expect(
          await raw.serviceCategory.findUnique({ where: { id: category.id } }),
        ).not.toBeNull();
        expect(
          await raw.service.findUnique({ where: { id: service.id } }),
        ).not.toBeNull();
      },
    );

    it('answers 404 for a Kategoria of another Salon and leaves it', async () => {
      const { asOwner } = await salonWithStaff();
      const other = await salonWithStaff();
      const foreign = await addCategory(other.salon.id, 'Obca');

      await asOwner.delete(`/api/service-categories/${foreign.id}`).expect(404);

      expect(
        await raw.serviceCategory.findUnique({ where: { id: foreign.id } }),
      ).not.toBeNull();
    });
  });

  describe('PUT /api/service-categories/order', () => {
    it('saves the new order of the Kategorie', async () => {
      const { salon, asOwner } = await salonWithStaff();
      const a = await addCategory(salon.id, 'A', 0);
      const b = await addCategory(salon.id, 'B', 1);
      const c = await addCategory(salon.id, 'C', 2);

      await asOwner
        .put('/api/service-categories/order')
        .send({ ids: [c.id, a.id, b.id] })
        .expect(204);

      const res = await asOwner.get('/api/service-categories').expect(200);
      expect((res.body as ServiceCategoryView[]).map((x) => x.id)).toEqual([
        c.id,
        a.id,
        b.id,
      ]);
    });

    it('answers 400 unless the list has every Kategoria exactly once', async () => {
      const { salon, asOwner } = await salonWithStaff();
      const a = await addCategory(salon.id, 'A', 0);
      const b = await addCategory(salon.id, 'B', 1);
      const other = await salonWithStaff();
      const foreign = await addCategory(other.salon.id, 'Obca');

      for (const ids of [
        [a.id],
        [a.id, b.id, b.id],
        [a.id, foreign.id],
        [a.id, b.id, foreign.id],
      ]) {
        const res = await asOwner
          .put('/api/service-categories/order')
          .send({ ids })
          .expect(400);
        expect(res.body.message).toBe(SERVICE_CATEGORY_ORDER_MISMATCH);
      }
      await asOwner.put('/api/service-categories/order').send({}).expect(400);
    });
  });

  describe('a Pracownik', () => {
    it('gets 403 on every change and changes nothing', async () => {
      const { salon, asEmployee } = await salonWithStaff();
      const a = await addCategory(salon.id, 'A', 0);
      const b = await addCategory(salon.id, 'B', 1);

      await asEmployee
        .post('/api/service-categories')
        .send({ name: 'Nowa' })
        .expect(403);
      await asEmployee
        .patch(`/api/service-categories/${a.id}`)
        .send({ name: 'Zmieniona' })
        .expect(403);
      await asEmployee
        .put('/api/service-categories/order')
        .send({ ids: [b.id, a.id] })
        .expect(403);
      await asEmployee.delete(`/api/service-categories/${a.id}`).expect(403);

      expect(
        await raw.serviceCategory.findMany({
          where: { salonId: salon.id },
          orderBy: { sortOrder: 'asc' },
          select: { name: true, sortOrder: true },
        }),
      ).toEqual([
        { name: 'A', sortOrder: 0 },
        { name: 'B', sortOrder: 1 },
      ]);
    });
  });
});

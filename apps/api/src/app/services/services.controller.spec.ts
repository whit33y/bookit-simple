import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  CreateServiceRequest,
  SERVICE_BREAK_INVALID,
  SERVICE_CATEGORY_REQUIRED,
  SERVICE_DESCRIPTION_MAX_LENGTH,
  SERVICE_DESCRIPTION_TOO_LONG,
  SERVICE_DURATION_INVALID,
  SERVICE_NAME_MAX_LENGTH,
  SERVICE_NAME_REQUIRED,
  SERVICE_NAME_TAKEN,
  SERVICE_NAME_TOO_LONG,
  SERVICE_ORDER_MISMATCH,
  SERVICE_PRICE_INVALID,
  SERVICE_PRICE_MAX_GROSZE,
  SERVICE_PRICE_TYPE_INVALID,
  ServiceView,
} from '@bookit/shared';
import { hash } from 'argon2';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';

const PASSWORD = 'correct horse battery staple';

describe('Usługi', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  let app: INestApplication;
  let passwordHash: string;

  const unique = () => randomUUID().slice(0, 8);

  async function addStaffMember(salonId: string, role: 'OWNER' | 'EMPLOYEE') {
    const email = `services-${unique()}@bookit.test`;
    const user = await raw.user.create({ data: { email, passwordHash } });
    const member = await raw.staffMember.create({
      data: { salonId, userId: user.id, role, displayName: role },
    });
    const client = request.agent(app.getHttpServer());
    await client
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { member, client };
  }

  /** A Salon with a Kategoria, a logged-in Właściciel and a logged-in Pracownik. */
  async function salonWithStaff() {
    const salon = await raw.salon.create({
      data: { name: `Studio ${unique()}`, slug: `uslugi-${unique()}` },
    });
    const owner = await addStaffMember(salon.id, 'OWNER');
    const employee = await addStaffMember(salon.id, 'EMPLOYEE');
    const category = await addCategory(salon.id, 'Strzyżenie', 0);
    return {
      salon,
      category,
      owner: owner.member,
      asOwner: owner.client,
      asEmployee: employee.client,
    };
  }

  function addCategory(salonId: string, name: string, sortOrder = 0) {
    return raw.serviceCategory.create({ data: { salonId, name, sortOrder } });
  }

  function addService(
    salonId: string,
    categoryId: string,
    name: string,
    { sortOrder = 0, archivedAt = null as Date | null, hidden = false } = {},
  ) {
    return raw.service.create({
      data: {
        salonId,
        categoryId,
        name,
        priceGrosze: 8000,
        priceType: 'FIXED',
        durationMin: 45,
        sortOrder,
        archivedAt,
        hidden,
      },
    });
  }

  const valid = (categoryId: string): CreateServiceRequest => ({
    categoryId,
    name: 'Strzyżenie damskie',
    priceGrosze: 9000,
    priceType: 'FROM',
    durationMin: 45,
  });

  const ids = (body: ServiceView[]) => body.map((s) => s.id);

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

  describe('GET /api/services', () => {
    it('lists the Usługi of the own Salon by Kategoria order, then their own, to the whole Personel', async () => {
      const { salon, category, asOwner, asEmployee } = await salonWithStaff();
      const nails = await addCategory(salon.id, 'Paznokcie', -1);
      const men = await addService(salon.id, category.id, 'Męskie', {
        sortOrder: 1,
      });
      const women = await addService(salon.id, category.id, 'Damskie', {
        sortOrder: 0,
        hidden: true,
      });
      const manicure = await addService(salon.id, nails.id, 'Manicure');
      const other = await salonWithStaff();
      await addService(other.salon.id, other.category.id, 'Obca');

      const res = await asOwner.get('/api/services').expect(200);

      expect(ids(res.body)).toEqual([manicure.id, women.id, men.id]);
      expect(res.body[1]).toEqual({
        id: women.id,
        categoryId: category.id,
        name: 'Damskie',
        description: null,
        priceGrosze: 8000,
        priceType: 'FIXED',
        durationMin: 45,
        breakMin: 0,
        hidden: true,
        archived: false,
      } satisfies ServiceView);
      const asStaff = await asEmployee.get('/api/services').expect(200);
      expect(asStaff.body).toEqual(res.body);
    });

    it('leaves archived Usługi out, so they cannot be picked for a Wizyta, unless asked for', async () => {
      const { salon, category, asOwner, asEmployee } = await salonWithStaff();
      const active = await addService(salon.id, category.id, 'Damskie');
      const archived = await addService(salon.id, category.id, 'Stare', {
        sortOrder: 1,
        archivedAt: new Date(),
      });

      const res = await asEmployee.get('/api/services').expect(200);
      expect(ids(res.body)).toEqual([active.id]);

      const all = await asOwner
        .get('/api/services?includeArchived=true')
        .expect(200);
      expect(ids(all.body)).toEqual([active.id, archived.id]);
      expect(all.body[1]).toMatchObject({ archived: true });
    });
  });

  describe('POST /api/services', () => {
    it('adds the Usługa at the end of its Kategoria', async () => {
      const { salon, category, asOwner } = await salonWithStaff();
      await addService(salon.id, category.id, 'Męskie', { sortOrder: 4 });

      const res = await asOwner
        .post('/api/services')
        .send({
          ...valid(category.id),
          name: ' Strzyżenie damskie ',
          description: ' Cena zależy od długości włosów ',
          breakMin: 10,
          hidden: true,
        })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        categoryId: category.id,
        name: 'Strzyżenie damskie',
        description: 'Cena zależy od długości włosów',
        priceGrosze: 9000,
        priceType: 'FROM',
        durationMin: 45,
        breakMin: 10,
        hidden: true,
        archived: false,
      } satisfies ServiceView);
      expect(
        await raw.service.findUniqueOrThrow({ where: { id: res.body.id } }),
      ).toMatchObject({ salonId: salon.id, sortOrder: 5 });
    });

    it('fills in no Przerwa, a shown Usługa and no description', async () => {
      const { category, asOwner } = await salonWithStaff();

      const res = await asOwner
        .post('/api/services')
        .send({ ...valid(category.id), description: '  ' })
        .expect(201);

      expect(res.body).toMatchObject({
        breakMin: 0,
        hidden: false,
        description: null,
      });
    });

    it.each([
      ['an empty name', { name: ' ' }, SERVICE_NAME_REQUIRED],
      ['no name', { name: undefined }, SERVICE_NAME_REQUIRED],
      [
        'a too long name',
        { name: 'x'.repeat(SERVICE_NAME_MAX_LENGTH + 1) },
        SERVICE_NAME_TOO_LONG,
      ],
      [
        'a too long description',
        { description: 'x'.repeat(SERVICE_DESCRIPTION_MAX_LENGTH + 1) },
        SERVICE_DESCRIPTION_TOO_LONG,
      ],
      ['a negative Cena', { priceGrosze: -1 }, SERVICE_PRICE_INVALID],
      [
        'a Cena in parts of a grosz',
        { priceGrosze: 7.5 },
        SERVICE_PRICE_INVALID,
      ],
      [
        'a too high Cena',
        { priceGrosze: SERVICE_PRICE_MAX_GROSZE + 1 },
        SERVICE_PRICE_INVALID,
      ],
      ['no Cena', { priceGrosze: undefined }, SERVICE_PRICE_INVALID],
      [
        'an unknown price type',
        { priceType: 'MAX' },
        SERVICE_PRICE_TYPE_INVALID,
      ],
      [
        'a Czas trwania under 5 min',
        { durationMin: 0 },
        SERVICE_DURATION_INVALID,
      ],
      [
        'a Czas trwania over 600 min',
        { durationMin: 605 },
        SERVICE_DURATION_INVALID,
      ],
      [
        'a Czas trwania not in 5 min steps',
        { durationMin: 42 },
        SERVICE_DURATION_INVALID,
      ],
      ['a negative Przerwa', { breakMin: -5 }, SERVICE_BREAK_INVALID],
      ['a Przerwa over 120 min', { breakMin: 125 }, SERVICE_BREAK_INVALID],
      ['a Przerwa not in 5 min steps', { breakMin: 3 }, SERVICE_BREAK_INVALID],
      ['no Kategoria', { categoryId: undefined }, SERVICE_CATEGORY_REQUIRED],
      [
        'a Kategoria that is not an id',
        { categoryId: 'x' },
        SERVICE_CATEGORY_REQUIRED,
      ],
    ])('answers 400 for %s', async (_, change, message) => {
      const { category, asOwner } = await salonWithStaff();

      const res = await asOwner
        .post('/api/services')
        .send({ ...valid(category.id), ...change })
        .expect(400);

      expect(res.body.message).toBe(message);
    });

    it('answers 400 for a Kategoria of another Salon', async () => {
      const { asOwner } = await salonWithStaff();
      const other = await salonWithStaff();

      const res = await asOwner
        .post('/api/services')
        .send(valid(other.category.id))
        .expect(400);

      expect(res.body.message).toBe(SERVICE_CATEGORY_REQUIRED);
      expect(
        await raw.service.count({ where: { categoryId: other.category.id } }),
      ).toBe(0);
    });

    it('answers 409 for a name already in the Kategoria, but not for an archived one or another Kategoria', async () => {
      const { salon, category, asOwner } = await salonWithStaff();
      const nails = await addCategory(salon.id, 'Paznokcie', 1);
      await addService(salon.id, category.id, 'Strzyżenie damskie');
      await addService(salon.id, category.id, 'Grzywka', {
        archivedAt: new Date(),
      });

      const res = await asOwner
        .post('/api/services')
        .send({ ...valid(category.id), name: 'STRZYŻENIE DAMSKIE' })
        .expect(409);
      expect(res.body.message).toBe(SERVICE_NAME_TAKEN);

      await asOwner
        .post('/api/services')
        .send({ ...valid(category.id), name: 'Grzywka' })
        .expect(201);
      await asOwner.post('/api/services').send(valid(nails.id)).expect(201);
    });
  });

  describe('PATCH /api/services/:id', () => {
    it('changes only the fields sent', async () => {
      const { salon, category, asOwner } = await salonWithStaff();
      const service = await addService(salon.id, category.id, 'Damskie');

      const res = await asOwner
        .patch(`/api/services/${service.id}`)
        .send({ priceGrosze: 7950, priceType: 'FROM', hidden: true })
        .expect(200);

      expect(res.body).toMatchObject({
        name: 'Damskie',
        priceGrosze: 7950,
        priceType: 'FROM',
        durationMin: 45,
        hidden: true,
      });
    });

    it('keeps its own name and clears the description', async () => {
      const { salon, category, asOwner } = await salonWithStaff();
      const service = await addService(salon.id, category.id, 'Damskie');
      await raw.service.update({
        where: { id: service.id },
        data: { description: 'Stary opis' },
      });

      const res = await asOwner
        .patch(`/api/services/${service.id}`)
        .send({ name: 'Damskie', description: null })
        .expect(200);

      expect(res.body).toMatchObject({ name: 'Damskie', description: null });
    });

    it('moves the Usługa to the end of another Kategoria', async () => {
      const { salon, category, asOwner } = await salonWithStaff();
      const nails = await addCategory(salon.id, 'Paznokcie', 1);
      await addService(salon.id, nails.id, 'Manicure', { sortOrder: 2 });
      const service = await addService(salon.id, category.id, 'Pedicure');

      const res = await asOwner
        .patch(`/api/services/${service.id}`)
        .send({ categoryId: nails.id })
        .expect(200);

      expect(res.body).toMatchObject({ categoryId: nails.id });
      expect(
        await raw.service.findUniqueOrThrow({ where: { id: service.id } }),
      ).toMatchObject({ sortOrder: 3 });
    });

    it('answers 409 for a name taken in the Kategoria and 400 for bad fields', async () => {
      const { salon, category, asOwner } = await salonWithStaff();
      await addService(salon.id, category.id, 'Damskie');
      const service = await addService(salon.id, category.id, 'Męskie');

      const taken = await asOwner
        .patch(`/api/services/${service.id}`)
        .send({ name: 'damskie' })
        .expect(409);
      expect(taken.body.message).toBe(SERVICE_NAME_TAKEN);
      const bad = await asOwner
        .patch(`/api/services/${service.id}`)
        .send({ durationMin: 7 })
        .expect(400);
      expect(bad.body.message).toBe(SERVICE_DURATION_INVALID);
    });

    it('answers 404 for a Usługa of another Salon and 400 for a Kategoria of another Salon', async () => {
      const { salon, category, asOwner } = await salonWithStaff();
      const service = await addService(salon.id, category.id, 'Damskie');
      const other = await salonWithStaff();
      const foreign = await addService(
        other.salon.id,
        other.category.id,
        'Obca',
      );

      await asOwner
        .patch(`/api/services/${foreign.id}`)
        .send({ name: 'Moja' })
        .expect(404);
      await asOwner
        .patch(`/api/services/${service.id}`)
        .send({ categoryId: other.category.id })
        .expect(400);
      await asOwner
        .patch('/api/services/not-an-id')
        .send({ name: 'X' })
        .expect(400);
      expect(
        await raw.service.findUniqueOrThrow({ where: { id: foreign.id } }),
      ).toMatchObject({ name: 'Obca' });
    });
  });

  describe('archiving', () => {
    it('takes the Usługa off the list and off the Wizytówka, and keeps it on old Wizyty', async () => {
      const { salon, category, owner, asOwner } = await salonWithStaff();
      const service = await addService(salon.id, category.id, 'Damskie');
      const client = await raw.client.create({
        data: { salonId: salon.id, name: 'Ola', nameNormalized: 'ola' },
      });
      const visit = await raw.visit.create({
        data: {
          salonId: salon.id,
          staffMemberId: owner.id,
          clientId: client.id,
          startsAt: new Date('2026-01-10T09:00:00Z'),
          durationMin: 45,
          createdById: owner.id,
          updatedById: owner.id,
          services: {
            create: {
              serviceId: service.id,
              nameSnapshot: 'Damskie',
              priceGroszeSnapshot: 8000,
              priceTypeSnapshot: 'FIXED',
            },
          },
        },
      });
      const shown = await request(app.getHttpServer())
        .get(`/api/public/pages/${salon.slug}`)
        .expect(200);
      expect(shown.body.categories).toHaveLength(1);

      const res = await asOwner
        .post(`/api/services/${service.id}/archive`)
        .expect(200);

      expect(res.body).toMatchObject({ id: service.id, archived: true });
      const list = await asOwner.get('/api/services').expect(200);
      expect(list.body).toEqual([]);
      const page = await request(app.getHttpServer())
        .get(`/api/public/pages/${salon.slug}`)
        .expect(200);
      expect(page.body.categories).toEqual([]);
      expect(
        await raw.visitService.findMany({
          where: { visitId: visit.id },
          select: { serviceId: true, nameSnapshot: true },
        }),
      ).toEqual([{ serviceId: service.id, nameSnapshot: 'Damskie' }]);
    });

    it('brings the Usługa back at the end of its Kategoria', async () => {
      const { salon, category, asOwner } = await salonWithStaff();
      const service = await addService(salon.id, category.id, 'Damskie', {
        archivedAt: new Date(),
      });
      const other = await addService(salon.id, category.id, 'Męskie', {
        sortOrder: 3,
      });

      const res = await asOwner
        .post(`/api/services/${service.id}/unarchive`)
        .expect(200);

      expect(res.body).toMatchObject({ archived: false });
      const list = await asOwner.get('/api/services').expect(200);
      expect(ids(list.body)).toEqual([other.id, service.id]);
    });

    it('answers 409 when bringing back a name that is taken again', async () => {
      const { salon, category, asOwner } = await salonWithStaff();
      const service = await addService(salon.id, category.id, 'Damskie', {
        archivedAt: new Date(),
      });
      await addService(salon.id, category.id, 'Damskie');

      const res = await asOwner
        .post(`/api/services/${service.id}/unarchive`)
        .expect(409);

      expect(res.body.message).toBe(SERVICE_NAME_TAKEN);
      expect(
        await raw.service.findUniqueOrThrow({ where: { id: service.id } }),
      ).toMatchObject({ archivedAt: expect.any(Date) });
    });

    it('answers 404 for a Usługa of another Salon', async () => {
      const { asOwner } = await salonWithStaff();
      const other = await salonWithStaff();
      const foreign = await addService(
        other.salon.id,
        other.category.id,
        'Obca',
      );

      await asOwner.post(`/api/services/${foreign.id}/archive`).expect(404);
      await asOwner.post(`/api/services/${foreign.id}/unarchive`).expect(404);

      expect(
        await raw.service.findUniqueOrThrow({ where: { id: foreign.id } }),
      ).toMatchObject({ archivedAt: null });
    });
  });

  describe('PUT /api/services/order', () => {
    it('saves the new order within the Kategoria', async () => {
      const { salon, category, asOwner } = await salonWithStaff();
      const a = await addService(salon.id, category.id, 'A', { sortOrder: 0 });
      const b = await addService(salon.id, category.id, 'B', { sortOrder: 1 });
      const c = await addService(salon.id, category.id, 'C', { sortOrder: 2 });
      await addService(salon.id, category.id, 'Stara', {
        archivedAt: new Date(),
      });

      await asOwner
        .put('/api/services/order')
        .send({ categoryId: category.id, ids: [c.id, a.id, b.id] })
        .expect(204);

      const res = await asOwner.get('/api/services').expect(200);
      expect(ids(res.body)).toEqual([c.id, a.id, b.id]);
    });

    it('answers 400 unless the list has every Usługa of the Kategoria that is not archived, exactly once', async () => {
      const { salon, category, asOwner } = await salonWithStaff();
      const a = await addService(salon.id, category.id, 'A');
      const b = await addService(salon.id, category.id, 'B');
      const archived = await addService(salon.id, category.id, 'Stara', {
        archivedAt: new Date(),
      });
      const nails = await addCategory(salon.id, 'Paznokcie', 1);
      const elsewhere = await addService(salon.id, nails.id, 'Manicure');
      const other = await salonWithStaff();
      const foreign = await addService(
        other.salon.id,
        other.category.id,
        'Obca',
      );

      for (const list of [
        [a.id],
        [a.id, b.id, b.id],
        [a.id, b.id, archived.id],
        [a.id, b.id, elsewhere.id],
        [a.id, foreign.id],
      ]) {
        const res = await asOwner
          .put('/api/services/order')
          .send({ categoryId: category.id, ids: list })
          .expect(400);
        expect(res.body.message).toBe(SERVICE_ORDER_MISMATCH);
      }
      await asOwner
        .put('/api/services/order')
        .send({ categoryId: other.category.id, ids: [foreign.id] })
        .expect(400);
      await asOwner.put('/api/services/order').send({}).expect(400);
    });
  });

  describe('a Pracownik', () => {
    it('gets 403 on every change and changes nothing', async () => {
      const { salon, category, asEmployee } = await salonWithStaff();
      const a = await addService(salon.id, category.id, 'A', { sortOrder: 0 });
      const b = await addService(salon.id, category.id, 'B', { sortOrder: 1 });

      await asEmployee
        .post('/api/services')
        .send(valid(category.id))
        .expect(403);
      await asEmployee
        .patch(`/api/services/${a.id}`)
        .send({ name: 'Zmieniona' })
        .expect(403);
      await asEmployee.post(`/api/services/${a.id}/archive`).expect(403);
      await asEmployee.post(`/api/services/${a.id}/unarchive`).expect(403);
      await asEmployee
        .put('/api/services/order')
        .send({ categoryId: category.id, ids: [b.id, a.id] })
        .expect(403);

      expect(
        await raw.service.findMany({
          where: { salonId: salon.id },
          orderBy: { sortOrder: 'asc' },
          select: { name: true, sortOrder: true, archivedAt: true },
        }),
      ).toEqual([
        { name: 'A', sortOrder: 0, archivedAt: null },
        { name: 'B', sortOrder: 1, archivedAt: null },
      ]);
    });
  });
});

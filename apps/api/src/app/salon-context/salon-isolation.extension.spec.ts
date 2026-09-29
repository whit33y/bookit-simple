import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '../../generated/prisma/client';
import {
  createIsolatedPrismaClient,
  createPrismaClient,
} from '../prisma/prisma.service';
import { SalonContext } from './salon-context';
import {
  SalonContextMissingError,
  SalonIsolationError,
} from './salon-isolation.extension';

interface SalonFixture {
  salonId: string;
  staffMemberId: string;
  visitId: string;
  clientId: string;
  serviceId: string;
  photoId: string;
  visitServiceId: string;
  invitationId: string;
}

/** The part of a model delegate these tests call, so one table covers four models. */
interface Delegate {
  findUnique(args: object): Promise<unknown>;
  findUniqueOrThrow(args: object): Promise<unknown>;
  findFirst(args: object): Promise<unknown>;
  findMany(args: object): Promise<unknown[]>;
  count(args: object): Promise<number>;
  update(args: object): Promise<unknown>;
  updateMany(args: object): Promise<{ count: number }>;
  delete(args: object): Promise<unknown>;
  deleteMany(args: object): Promise<{ count: number }>;
}

describe('Salon isolation Prisma extension', () => {
  const url = process.env.DATABASE_URL ?? '';
  const raw = createPrismaClient(url);
  const cls = new ClsService<SalonContext>(new AsyncLocalStorage());
  const prisma = createIsolatedPrismaClient(url, cls);

  // Prisma queries are lazy: they run on `then`, so await inside the context.
  const inContext = <T>(store: SalonContext, fn: () => Promise<T>) =>
    cls.runWith(store, async () => await fn());
  const inSalon = <T>(salonId: string, fn: () => Promise<T>) =>
    inContext({ salonId }, fn);
  const inAdminScope = <T>(fn: () => Promise<T>) =>
    inContext({ adminScope: true }, fn);

  let a: SalonFixture;
  let b: SalonFixture;

  async function createSalon(): Promise<SalonFixture> {
    const salon = await raw.salon.create({
      data: { name: 'Salon', slug: `test-${randomUUID()}` },
    });
    const salonId = salon.id;
    const staffMember = await raw.staffMember.create({
      data: { salonId, role: 'OWNER', displayName: 'Anna' },
    });
    const client = await raw.client.create({
      data: { salonId, name: 'Klient' },
    });
    const category = await raw.serviceCategory.create({
      data: { salonId, name: 'Strzyżenie' },
    });
    const service = await raw.service.create({
      data: {
        salonId,
        categoryId: category.id,
        name: 'Strzyżenie damskie',
        priceGrosze: 8000,
        priceType: 'FIXED',
        durationMin: 60,
      },
    });
    const photo = await raw.photo.create({
      data: {
        salonId,
        storageKey: `test/${randomUUID()}.jpg`,
        width: 100,
        height: 100,
        bytes: 1000,
      },
    });
    const visit = await raw.visit.create({
      data: {
        salonId,
        staffMemberId: staffMember.id,
        clientId: client.id,
        startsAt: new Date('2026-10-01T09:00:00Z'),
        durationMin: 60,
        description: 'Strzyżenie',
        createdById: staffMember.id,
        updatedById: staffMember.id,
      },
    });
    const visitService = await raw.visitService.create({
      data: {
        visitId: visit.id,
        serviceId: service.id,
        nameSnapshot: service.name,
        priceGroszeSnapshot: service.priceGrosze,
        priceTypeSnapshot: service.priceType,
      },
    });
    const invitation = await raw.invitation.create({
      data: {
        staffMemberId: staffMember.id,
        tokenHash: randomUUID(),
        expiresAt: new Date('2026-10-08T09:00:00Z'),
      },
    });
    return {
      salonId,
      staffMemberId: staffMember.id,
      visitServiceId: visitService.id,
      invitationId: invitation.id,
      visitId: visit.id,
      clientId: client.id,
      serviceId: service.id,
      photoId: photo.id,
    };
  }

  beforeAll(async () => {
    a = await createSalon();
    b = await createSalon();
  });

  afterAll(async () => {
    const salonIds = [a.salonId, b.salonId];
    // VisitService -> Service is NoAction, so remove Visits (and their Services) first.
    await raw.visit.deleteMany({ where: { salonId: { in: salonIds } } });
    await raw.salon.deleteMany({ where: { id: { in: salonIds } } });
    await raw.$disconnect();
    await prisma.$disconnect();
  });

  describe.each([
    {
      model: 'Visit',
      delegate: () => prisma.visit as unknown as Delegate,
      id: (s: SalonFixture) => s.visitId,
      data: { description: 'changed' },
    },
    {
      model: 'Client',
      delegate: () => prisma.client as unknown as Delegate,
      id: (s: SalonFixture) => s.clientId,
      data: { name: 'changed' },
    },
    {
      model: 'Service',
      delegate: () => prisma.service as unknown as Delegate,
      id: (s: SalonFixture) => s.serviceId,
      data: { name: 'changed' },
    },
    {
      model: 'Photo',
      delegate: () => prisma.photo as unknown as Delegate,
      id: (s: SalonFixture) => s.photoId,
      data: { width: 1 },
    },
  ])('$model of Salon B seen from Salon A', ({ delegate, id, data }) => {
    const missingId = randomUUID();
    const where = () => ({ where: { id: id(b) } });

    /** Salon B's record, read without the filter, to prove it was not touched. */
    const recordOfB = () =>
      inAdminScope(() => delegate().findUnique({ where: { id: id(b) } }));

    it('is found in its own Salon', async () => {
      await expect(
        inSalon(b.salonId, () => delegate().findUnique(where())),
      ).resolves.toMatchObject({
        id: id(b),
      });
    });

    it('reads like a record that does not exist', async () => {
      await inSalon(a.salonId, async () => {
        expect(await delegate().findUnique(where())).toBeNull();
        expect(await delegate().findFirst(where())).toBeNull();
        expect(await delegate().findMany(where())).toEqual([]);
        expect(await delegate().count(where())).toBe(0);
        await expect(
          delegate().findUniqueOrThrow(where()),
        ).rejects.toMatchObject({
          code: 'P2025',
        });
      });
    });

    it('reads the same as a missing id', async () => {
      await inSalon(a.salonId, async () => {
        const missing = await delegate()
          .findUniqueOrThrow({ where: { id: missingId } })
          .catch((e: Prisma.PrismaClientKnownRequestError) => e.code);
        const ofB = await delegate()
          .findUniqueOrThrow(where())
          .catch((e: Prisma.PrismaClientKnownRequestError) => e.code);
        expect(ofB).toBe(missing);
      });
    });

    it('cannot be edited', async () => {
      const before = await recordOfB();

      await inSalon(a.salonId, async () => {
        await expect(
          delegate().update({ ...where(), data }),
        ).rejects.toMatchObject({
          code: 'P2025',
        });
        expect(await delegate().updateMany({ ...where(), data })).toEqual({
          count: 0,
        });
      });

      expect(await recordOfB()).toEqual(before);
    });

    it('cannot be deleted', async () => {
      await inSalon(a.salonId, async () => {
        await expect(delegate().delete(where())).rejects.toMatchObject({
          code: 'P2025',
        });
        expect(await delegate().deleteMany(where())).toEqual({ count: 0 });
      });

      expect(await recordOfB()).not.toBeNull();
    });
  });

  describe('models linked to a Salon without their own salonId', () => {
    it('hides another Salon, including its data under include', async () => {
      await inSalon(a.salonId, async () => {
        expect(
          await prisma.salon.findUnique({
            where: { id: b.salonId },
            include: { clients: true },
          }),
        ).toBeNull();
        expect(
          await prisma.salon.findMany({
            where: { id: { in: [a.salonId, b.salonId] } },
            select: { id: true },
          }),
        ).toEqual([{ id: a.salonId }]);
      });
    });

    it('cannot edit another Salon or its data through nested writes', async () => {
      await inSalon(a.salonId, async () => {
        await expect(
          prisma.salon.update({
            where: { id: b.salonId },
            data: { clients: { deleteMany: {} } },
          }),
        ).rejects.toMatchObject({ code: 'P2025' });
      });

      expect(
        await raw.client.count({ where: { salonId: b.salonId } }),
      ).toBeGreaterThan(0);
    });

    it('sees its own Salon', async () => {
      await expect(
        inSalon(a.salonId, () =>
          prisma.salon.findUnique({ where: { id: a.salonId } }),
        ),
      ).resolves.toMatchObject({ id: a.salonId });
    });

    it.each([
      {
        model: 'VisitService',
        delegate: () => prisma.visitService as unknown as Delegate,
        id: (s: SalonFixture) => s.visitServiceId,
      },
      {
        model: 'Invitation',
        delegate: () => prisma.invitation as unknown as Delegate,
        id: (s: SalonFixture) => s.invitationId,
      },
    ])('limits $model through its parent', async ({ delegate, id }) => {
      await inSalon(a.salonId, async () => {
        expect(
          await delegate().findUnique({ where: { id: id(b) } }),
        ).toBeNull();
        expect(
          await delegate().findMany({ where: { id: { in: [id(a), id(b)] } } }),
        ).toEqual([expect.objectContaining({ id: id(a) })]);
        expect(await delegate().deleteMany({ where: { id: id(b) } })).toEqual({
          count: 0,
        });
      });
    });

    it("keeps the caller's own relation filter", async () => {
      const rows = await inSalon(a.salonId, () =>
        prisma.visitService.findMany({ where: { visit: { id: b.visitId } } }),
      );

      expect(rows).toEqual([]);
    });
  });

  it('filters aggregate and groupBy', async () => {
    await inSalon(a.salonId, async () => {
      const aggregate = await prisma.service.aggregate({
        where: { id: { in: [a.serviceId, b.serviceId] } },
        _count: { _all: true },
      });
      expect(aggregate._count._all).toBe(1);

      const groups = await prisma.service.groupBy({
        by: ['salonId'],
        where: { id: { in: [a.serviceId, b.serviceId] } },
      });
      expect(groups).toEqual([{ salonId: a.salonId }]);
    });
  });

  it('filters inside an interactive transaction', async () => {
    await inSalon(a.salonId, () =>
      prisma.$transaction(async (tx) => {
        expect(
          await tx.client.findUnique({ where: { id: b.clientId } }),
        ).toBeNull();
      }),
    );
  });

  describe('create', () => {
    it('takes salonId from the context when none is given', async () => {
      const client = await inSalon(a.salonId, () =>
        prisma.client.create({
          data: { name: 'Nowy' } as Prisma.ClientUncheckedCreateInput,
        }),
      );

      expect(client.salonId).toBe(a.salonId);
    });

    it('takes salonId from the context in createMany', async () => {
      const name = `many-${randomUUID()}`;
      await inSalon(a.salonId, () =>
        prisma.client.createMany({
          data: [{ name }, { name }] as Prisma.ClientCreateManyInput[],
        }),
      );

      const rows = await raw.client.findMany({ where: { name } });
      expect(rows.map((r) => r.salonId)).toEqual([a.salonId, a.salonId]);
    });

    it('takes salonId from the context in the create branch of upsert', async () => {
      const id = randomUUID();
      const client = await inSalon(a.salonId, () =>
        prisma.client.upsert({
          where: { id },
          create: { id, name: 'Upsert' } as Prisma.ClientUncheckedCreateInput,
          update: {},
        }),
      );

      expect(client.salonId).toBe(a.salonId);
    });

    it('refuses a salonId of another Salon', async () => {
      await expect(
        inSalon(a.salonId, () =>
          prisma.client.create({ data: { name: 'Obcy', salonId: b.salonId } }),
        ),
      ).rejects.toThrow(SalonIsolationError);
    });

    it('refuses to connect the record to another Salon', async () => {
      await expect(
        inSalon(a.salonId, () =>
          prisma.client.create({
            data: { name: 'Obcy', salon: { connect: { id: b.salonId } } },
          }),
        ),
      ).rejects.toThrow(SalonIsolationError);
    });
  });

  it('refuses to move a record to another Salon', async () => {
    await expect(
      inSalon(a.salonId, () =>
        prisma.client.update({
          where: { id: a.clientId },
          data: { salonId: b.salonId },
        }),
      ),
    ).rejects.toThrow(SalonIsolationError);

    expect(
      await raw.client.findUnique({ where: { id: a.clientId } }),
    ).toMatchObject({
      salonId: a.salonId,
    });
  });

  describe('without a Salon context', () => {
    it('throws outside any request context', async () => {
      await expect(prisma.client.findMany()).rejects.toThrow(
        SalonContextMissingError,
      );
    });

    it('throws when the context has no salonId and no adminScope', async () => {
      await expect(
        inContext({ isAdministrator: true }, () => prisma.visit.count()),
      ).rejects.toThrow(SalonContextMissingError);
    });

    it('throws on writes too', async () => {
      await expect(
        prisma.client.deleteMany({ where: { id: b.clientId } }),
      ).rejects.toThrow(SalonContextMissingError);
      expect(
        await raw.client.findUnique({ where: { id: b.clientId } }),
      ).not.toBeNull();
    });

    it('does not filter global models', async () => {
      await expect(prisma.user.count()).resolves.toEqual(expect.any(Number));
    });

    it('leaves linked models unfiltered, for public pages and login', async () => {
      await expect(
        prisma.salon.count({ where: { id: a.salonId } }),
      ).resolves.toBe(1);
    });
  });

  it('adminScope sees every Salon', async () => {
    const clients = await inAdminScope(() =>
      prisma.client.findMany({
        where: { id: { in: [a.clientId, b.clientId] } },
      }),
    );

    expect(clients.map((c) => c.salonId).sort()).toEqual(
      [a.salonId, b.salonId].sort(),
    );
  });
});

import { randomUUID } from 'node:crypto';
import { verify } from 'argon2';
import { createPrismaClient } from '../app/prisma/prisma.service';
import { seedAdministrator } from './seed-administrator';

describe('seedAdministrator', () => {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  const email = `seed-${randomUUID()}@bookit.test`;

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('creates an Administrator whose password verifies with argon2', async () => {
    await seedAdministrator(prisma, { email, password: 'admin1234' });

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.isAdministrator).toBe(true);
    expect(await verify(user.passwordHash ?? '', 'admin1234')).toBe(true);
  });

  it('leaves a single Administrator when run twice', async () => {
    await seedAdministrator(prisma, { email, password: 'admin1234' });
    await seedAdministrator(prisma, { email, password: 'admin1234' });

    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('stores the e-mail lowercased, so a differently cased ADMIN_EMAIL is the same person', async () => {
    await seedAdministrator(prisma, {
      email: email.toUpperCase(),
      password: 'admin1234',
    });

    expect(
      await prisma.user.count({
        where: { email: { equals: email, mode: 'insensitive' } },
      }),
    ).toBe(1);
  });
});

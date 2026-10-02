import type { TestRunGlobals } from './jest.global-setup';
import { createPrismaClient } from './src/app/prisma/prisma.service';

// The specs share the dev database and create Salons and Users of their own. Without
// this, they pile up run after run until listing Salons exceeds Postgres's bind
// parameter limit (P2029). Whatever a Salon owns goes with it by cascade.
export default async function globalTeardown(): Promise<void> {
  const since = (globalThis as TestRunGlobals).__TEST_RUN_STARTED_AT__;
  if (!since) return;

  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  try {
    const createdInRun = { createdAt: { gte: since } };
    const ofSalonInRun = { salon: createdInRun };
    // The `NoAction` relations first: Postgres checks them in the middle of a
    // Salon's cascade, while the rows pointing at them may still be there.
    await prisma.visit.deleteMany({ where: ofSalonInRun });
    await prisma.visitChange.deleteMany({ where: ofSalonInRun });
    await prisma.service.deleteMany({ where: ofSalonInRun });
    await prisma.salon.deleteMany({ where: createdInRun });
    await prisma.user.deleteMany({ where: createdInRun });
    await prisma.session.deleteMany({ where: createdInRun });
  } finally {
    await prisma.$disconnect();
  }
}

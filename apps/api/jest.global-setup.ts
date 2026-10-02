import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { createPrismaClient } from './src/app/prisma/prisma.service';

/** Shared with `jest.global-teardown.ts`; Jest runs both in the same process. */
export type TestRunGlobals = { __TEST_RUN_STARTED_AT__?: Date };

// Integration tests run on a real Postgres (DATABASE_URL). Bring its schema up to date first.
export default async function globalSetup(): Promise<void> {
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '../..'),
    stdio: 'inherit',
  });

  // The database's clock, not ours: `createdAt` defaults to its `now()`.
  // `jest.global-teardown.ts` deletes whatever the run created after this moment.
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  try {
    const [{ now }] = await prisma.$queryRaw<[{ now: Date }]>`SELECT now()`;
    (globalThis as TestRunGlobals).__TEST_RUN_STARTED_AT__ = now;
  } finally {
    await prisma.$disconnect();
  }
}

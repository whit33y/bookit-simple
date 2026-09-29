import 'dotenv/config';
import { validateSeedEnv } from '../app/config/env';
import { createPrismaClient } from '../app/prisma/prisma.service';
import { seedAdministrator } from './seed-administrator';

// Run by `nx run api:seed` (`prisma db seed`). Safe to run repeatedly.
async function main(): Promise<void> {
  const env = validateSeedEnv(process.env);
  const prisma = createPrismaClient(env.DATABASE_URL);
  try {
    await seedAdministrator(prisma, {
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
    });
    console.log(`Administrator ${env.ADMIN_EMAIL} is ready.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { Env, validateSeedEnv } from '../app/config/env';
import { S3PhotoStorage } from '../app/photos/photo-storage';
import { createPrismaClient } from '../app/prisma/prisma.service';
import { seedAdministrator } from './seed-administrator';
import { seedStudioKora } from './studio-kora/seed-studio-kora';

// Run by `nx run api:seed` (`prisma db seed`). Safe to run repeatedly.
async function main(): Promise<void> {
  const env = validateSeedEnv(process.env);
  const prisma = createPrismaClient(env.DATABASE_URL);
  // `S3PhotoStorage` reads only the `S3_*` keys, which the seed env has.
  const storage = new S3PhotoStorage(
    new ConfigService(env) as unknown as ConfigService<Env, true>,
  );
  try {
    await seedAdministrator(prisma, {
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
    });
    console.log(`Administrator ${env.ADMIN_EMAIL} is ready.`);

    const { emails } = await seedStudioKora(prisma, storage, {
      password: env.SEED_PASSWORD,
    });
    console.log(
      `Studio Kora is ready at /studio-kora. Personel: ${emails.join(', ')}.`,
    );
  } finally {
    storage.onModuleDestroy();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

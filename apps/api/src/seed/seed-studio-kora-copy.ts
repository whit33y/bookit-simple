import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { parseArgs } from 'node:util';
import { Env, validateSeedEnv } from '../app/config/env';
import { S3PhotoStorage } from '../app/photos/photo-storage';
import { createPrismaClient } from '../app/prisma/prisma.service';
import { removeSalon, seedStudioKora } from './studio-kora/seed-studio-kora';
import { STAFF } from './studio-kora/studio-kora-data';

/**
 * A copy of Studio Kora under its own address and e-mail domain, for the pilot e2e
 * scenarios (#38), each on a fresh one, so they run in any order and side by side:
 *
 *   tsx seed-studio-kora-copy.ts --slug kora-abc --email-domain kora-abc.test
 *
 * prints `{ "salonId", "emails" }` as the last line. `--remove` deletes the copy again.
 * The Personel gets `SEED_PASSWORD`; the Administrator is left alone.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      slug: { type: 'string' },
      'email-domain': { type: 'string' },
      remove: { type: 'boolean', default: false },
    },
  });
  const slug = values.slug;
  const emailDomain = values['email-domain'];
  if (!slug || !emailDomain) {
    throw new Error('Usage: --slug <slug> --email-domain <domain> [--remove]');
  }

  const env = validateSeedEnv(process.env);
  const prisma = createPrismaClient(env.DATABASE_URL);
  const storage = new S3PhotoStorage(
    new ConfigService(env) as unknown as ConfigService<Env, true>,
  );
  try {
    if (values.remove) {
      const emails = STAFF.map((member) => `${member.key}@${emailDomain}`);
      await removeSalon(prisma, storage, slug, emails);
      return;
    }
    const seeded = await seedStudioKora(prisma, storage, {
      password: env.SEED_PASSWORD,
      slug,
      emailDomain,
    });
    console.log(JSON.stringify(seeded));
  } finally {
    storage.onModuleDestroy();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env by itself, hence dotenv.
// `process.env` instead of `env()`, so `prisma generate` (and `build`) work without a database URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx apps/api/src/seed/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});

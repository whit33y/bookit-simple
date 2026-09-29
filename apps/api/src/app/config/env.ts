import { z } from 'zod';

const MISSING = 'is missing';
const requiredString = z.string().trim().min(1, MISSING);

const envSchema = z.object({
  DATABASE_URL: requiredString,
  S3_ENDPOINT: z.url(),
  S3_ACCESS_KEY: requiredString,
  S3_SECRET_KEY: requiredString,
  S3_BUCKET: requiredString,
  SMTP_HOST: requiredString,
  SMTP_PORT: z.coerce.number().int().positive(),
  MAIL_FROM: requiredString,
  SESSION_SECRET: requiredString.min(32, 'must be at least 32 characters'),
  APP_URL: z.url(),
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD: requiredString,
});

const seedEnvSchema = envSchema.pick({
  DATABASE_URL: true,
  ADMIN_EMAIL: true,
  ADMIN_PASSWORD: true,
});

export type Env = z.infer<typeof envSchema>;
export type SeedEnv = z.infer<typeof seedEnvSchema>;

/** Used by `ConfigModule.forRoot({ validate })`, so a bad env stops `api` before it starts listening. */
export function validateEnv(raw: Record<string, unknown>): Env {
  return parseEnv(envSchema, raw);
}

/** The seed needs only the database and the Administrator's credentials. */
export function validateSeedEnv(raw: Record<string, unknown>): SeedEnv {
  return parseEnv(seedEnvSchema, raw);
}

function parseEnv<T extends z.ZodType>(
  schema: T,
  raw: Record<string, unknown>,
): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const name = String(issue.path[0]);
      const value = raw[name];
      const missing = value === undefined || String(value).trim() === '';
      return `  ${name}: ${missing ? MISSING : issue.message}`;
    });
    throw new Error(
      `Invalid environment variables (see .env.example):\n${problems.join('\n')}`,
    );
  }
  return result.data;
}

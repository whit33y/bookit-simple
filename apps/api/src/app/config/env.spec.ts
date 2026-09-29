import { validateEnv, validateSeedEnv } from './env';

const validEnv = {
  DATABASE_URL: 'postgresql://bookit:bookit@localhost:5432/bookit',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'bookit',
  S3_SECRET_KEY: 'bookit-secret',
  S3_BUCKET: 'bookit',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Bookit <no-reply@bookit.local>',
  SESSION_SECRET: 'a'.repeat(32),
  APP_URL: 'http://localhost:4200',
  ADMIN_EMAIL: 'admin@bookit.local',
  ADMIN_PASSWORD: 'admin1234',
};

describe('validateEnv', () => {
  it('returns typed config for a complete environment', () => {
    const env = validateEnv(validEnv);

    expect(env.SMTP_PORT).toBe(1025);
    expect(env.S3_BUCKET).toBe('bookit');
  });

  it('names the missing variable', () => {
    const { SESSION_SECRET: _, ...withoutSecret } = validEnv;

    expect(() => validateEnv(withoutSecret)).toThrow(/SESSION_SECRET/);
  });

  it('lists every missing variable at once', () => {
    const { SMTP_HOST: _h, APP_URL: _u, ...rest } = validEnv;

    expect(() => validateEnv(rest)).toThrow(/SMTP_HOST[\s\S]*APP_URL/);
  });

  it('treats an empty value as missing', () => {
    expect(() => validateEnv({ ...validEnv, S3_BUCKET: '' })).toThrow(
      /S3_BUCKET/,
    );
  });

  it('reports an empty URL variable as missing', () => {
    expect(() => validateEnv({ ...validEnv, S3_ENDPOINT: '' })).toThrow(
      /S3_ENDPOINT: is missing/,
    );
  });

  it('rejects a short SESSION_SECRET', () => {
    expect(() => validateEnv({ ...validEnv, SESSION_SECRET: 'short' })).toThrow(
      /SESSION_SECRET/,
    );
  });

  it('rejects a non-numeric SMTP_PORT', () => {
    expect(() => validateEnv({ ...validEnv, SMTP_PORT: 'abc' })).toThrow(
      /SMTP_PORT/,
    );
  });
});

describe('validateSeedEnv', () => {
  it('needs only the database and the Administrator credentials', () => {
    const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } = validEnv;

    expect(
      validateSeedEnv({ DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD }),
    ).toEqual({ DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD });
  });

  it('names a missing ADMIN_PASSWORD', () => {
    const { ADMIN_PASSWORD: _, ...rest } = validEnv;

    expect(() => validateSeedEnv(rest)).toThrow(/ADMIN_PASSWORD: is missing/);
  });
});

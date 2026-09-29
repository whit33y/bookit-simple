import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RESERVED_SLUGS } from '@bookit/shared';
import request from 'supertest';
import { configureApp, GLOBAL_PREFIX } from '../configure-app';
import { HealthModule } from './health.module';
import { S3HealthIndicator, SmtpHealthIndicator } from './indicators';

describe('GET /api/health', () => {
  let app: INestApplication;
  const s3 = { check: jest.fn<Promise<void>, []>() };
  const smtp = { check: jest.fn<Promise<void>, []>() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule.register({ timeoutMs: 50 })],
    })
      .overrideProvider(S3HealthIndicator)
      .useValue(s3)
      .overrideProvider(SmtpHealthIndicator)
      .useValue(smtp)
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  beforeEach(() => {
    s3.check.mockResolvedValue();
    smtp.check.mockResolvedValue();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns ok when S3 and SMTP respond', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200, { status: 'ok', s3: 'ok', smtp: 'ok' });
  });

  it('returns 503 with s3 down when MinIO is unreachable', async () => {
    s3.check.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await request(app.getHttpServer())
      .get('/api/health')
      .expect(503, { status: 'down', s3: 'down', smtp: 'ok' });
  });

  it('returns 503 with smtp down when SMTP is unreachable', async () => {
    smtp.check.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await request(app.getHttpServer())
      .get('/api/health')
      .expect(503, { status: 'down', s3: 'ok', smtp: 'down' });
  });

  it('treats a check that hangs past the timeout as down', async () => {
    s3.check.mockReturnValue(new Promise(() => undefined));

    await request(app.getHttpServer())
      .get('/api/health')
      .expect(503, { status: 'down', s3: 'down', smtp: 'ok' });
  });

  it('lives under reserved slugs, so no Wizytówka can shadow it', () => {
    expect(RESERVED_SLUGS).toContain(GLOBAL_PREFIX);
    expect(RESERVED_SLUGS).toContain('health');
  });
});

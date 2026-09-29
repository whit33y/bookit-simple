import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RESERVED_SLUGS } from '@bookit/shared';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp, GLOBAL_PREFIX } from '../configure-app';

describe('GET /api/health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns status ok', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200, { status: 'ok' });
  });

  it('lives under reserved slugs, so no Wizytówka can shadow it', () => {
    expect(RESERVED_SLUGS).toContain(GLOBAL_PREFIX);
    expect(RESERVED_SLUGS).toContain('health');
  });
});

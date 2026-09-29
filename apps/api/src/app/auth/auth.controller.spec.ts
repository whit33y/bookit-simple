import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import request from 'supertest';
import { createPrismaClient } from '../prisma/prisma.service';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { BAD_CREDENTIALS, SALON_SUSPENDED } from './auth.service';
import { SessionService } from './session.service';

const PASSWORD = 'correct horse battery staple';

describe('/api/auth', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  let app: INestApplication;
  let sessions: SessionService;
  let passwordHash: string;

  const uniqueEmail = () => `staff-${randomUUID()}@bookit.test`;

  /** A Salon with one Właściciel who can log in. */
  async function createOwner(email = uniqueEmail()) {
    const salon = await raw.salon.create({
      data: { name: 'Studio Anna', slug: `test-${randomUUID()}` },
    });
    const user = await raw.user.create({ data: { email, passwordHash } });
    const staffMember = await raw.staffMember.create({
      data: {
        salonId: salon.id,
        userId: user.id,
        role: 'OWNER',
        displayName: 'Anna',
      },
    });
    return { email, salon, user, staffMember };
  }

  const agent = () => request.agent(app.getHttpServer());
  const login = (
    client: ReturnType<typeof agent>,
    email: string,
    password = PASSWORD,
  ) => client.post('/api/auth/login').send({ email, password });

  beforeAll(async () => {
    passwordHash = await hash(PASSWORD);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    sessions = app.get(SessionService);
  });

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  describe('POST /login', () => {
    it('returns the same 401 for a wrong password and an unknown e-mail', async () => {
      const { email } = await createOwner();

      const wrongPassword = await login(agent(), email, 'wrong').expect(401);
      const unknownEmail = await login(agent(), uniqueEmail()).expect(401);

      expect(wrongPassword.body.message).toBe(BAD_CREDENTIALS);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });

    it('returns 401 for an account whose invitation is not accepted yet', async () => {
      const email = uniqueEmail();
      await raw.user.create({ data: { email } });

      const res = await login(agent(), email).expect(401);

      expect(res.body.message).toBe(BAD_CREDENTIALS);
    });

    it('trims the e-mail and ignores its case', async () => {
      const { email } = await createOwner();

      await login(agent(), `  ${email.toUpperCase()} `).expect(200);
    });

    it('returns 400 without an e-mail or a password', async () => {
      await agent()
        .post('/api/auth/login')
        .send({ email: 'a@b.pl' })
        .expect(400);
    });

    it('sets an httpOnly, SameSite=Lax bookit.sid cookie valid for 30 days', async () => {
      const { email } = await createOwner();

      const res = await login(agent(), email).expect(200);

      const cookie = [res.headers['set-cookie']].flat().join(';');
      expect(cookie).toMatch(/^bookit\.sid=/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/);
      expect(cookie).not.toMatch(/Secure/);
      const expires = new Date(/Expires=([^;]+)/.exec(cookie)?.[1] ?? '');
      const days = (expires.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThanOrEqual(30);
    });

    it('returns 403 for the Personel of a suspended Salon', async () => {
      const { email, salon } = await createOwner();
      await raw.salon.update({
        where: { id: salon.id },
        data: { status: 'SUSPENDED' },
      });

      const res = await login(agent(), email).expect(403);

      expect(res.body.message).toBe(SALON_SUSPENDED);
    });

    it('returns 429 on the 11th attempt for one e-mail within 15 minutes', async () => {
      const { email } = await createOwner();

      for (let attempt = 1; attempt <= 10; attempt++) {
        await login(agent(), email, 'wrong').expect(401);
      }
      await login(agent(), email).expect(429);
      await login(agent(), uniqueEmail()).expect(401);
    });

    it('counts attempts per e-mail after trimming and lowercasing', async () => {
      const { email } = await createOwner();

      for (let attempt = 1; attempt <= 10; attempt++) {
        await login(
          agent(),
          attempt % 2 ? email : ` ${email.toUpperCase()}`,
          'wrong',
        );
      }
      await login(agent(), email).expect(429);
    });
  });

  describe('GET /me and POST /logout', () => {
    it('returns 401 without a session', async () => {
      await agent().get('/api/auth/me').expect(401);
    });

    it('returns the person after login and 401 after logout', async () => {
      const { email, salon, user, staffMember } = await createOwner();
      const client = agent();
      await login(client, email).expect(200);

      const me = await client.get('/api/auth/me').expect(200);
      expect(me.body).toEqual({
        user: { id: user.id, email, isAdministrator: false },
        staffMember: { id: staffMember.id, displayName: 'Anna' },
        salon: { id: salon.id, name: 'Studio Anna', slug: salon.slug },
        role: 'OWNER',
      });

      await client.post('/api/auth/logout').expect(204);
      await client.get('/api/auth/me').expect(401);
    });

    it('returns the Administrator without a Salon', async () => {
      const email = uniqueEmail();
      const user = await raw.user.create({
        data: { email, passwordHash, isAdministrator: true },
      });
      const client = agent();
      await login(client, email).expect(200);

      await client.get('/api/auth/me').expect(200, {
        user: { id: user.id, email, isAdministrator: true },
        staffMember: null,
        salon: null,
        role: null,
      });
    });

    it('drops the session of a person removed from the Personel', async () => {
      const { email, staffMember } = await createOwner();
      const client = agent();
      await login(client, email).expect(200);

      await raw.staffMember.update({
        where: { id: staffMember.id },
        data: { deletedAt: new Date(), userId: null },
      });

      await client.get('/api/auth/me').expect(401);
    });
  });

  describe('invalidating sessions', () => {
    it('destroyAllForUser logs the person out on every device', async () => {
      const { email, user } = await createOwner();
      const phone = agent();
      const laptop = agent();
      await login(phone, email).expect(200);
      await login(laptop, email).expect(200);

      await sessions.destroyAllForUser(user.id);

      await phone.get('/api/auth/me').expect(401);
      await laptop.get('/api/auth/me').expect(401);
    });

    it('destroyAllForSalon logs out the whole Personel of that Salon only', async () => {
      const owner = await createOwner();
      const other = await createOwner();
      const ownerClient = agent();
      const otherClient = agent();
      await login(ownerClient, owner.email).expect(200);
      await login(otherClient, other.email).expect(200);

      await sessions.destroyAllForSalon(owner.salon.id);

      await ownerClient.get('/api/auth/me').expect(401);
      await otherClient.get('/api/auth/me').expect(200);
    });

    it('returns 403 to an existing session once its Salon is SUSPENDED', async () => {
      const { email, salon } = await createOwner();
      const client = agent();
      await login(client, email).expect(200);

      await raw.salon.update({
        where: { id: salon.id },
        data: { status: 'SUSPENDED' },
      });

      const res = await client.get('/api/auth/me').expect(403);
      expect(res.body.message).toBe(SALON_SUSPENDED);
      await client.get('/api/auth/me').expect(403);
    });

    it('lets a suspended session log out or log in to another account', async () => {
      const suspended = await createOwner();
      const active = await createOwner();
      const client = agent();
      await login(client, suspended.email).expect(200);
      await raw.salon.update({
        where: { id: suspended.salon.id },
        data: { status: 'SUSPENDED' },
      });

      await login(client, active.email).expect(200);
      await client.get('/api/auth/me').expect(200);
      await client.post('/api/auth/logout').expect(204);
      await client.get('/api/auth/me').expect(401);
    });

    it('pruneExpired removes only expired sessions', async () => {
      const { user } = await createOwner();
      const expired = await raw.session.create({
        data: {
          sid: randomUUID(),
          userId: user.id,
          data: {},
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      const live = await raw.session.create({
        data: {
          sid: randomUUID(),
          userId: user.id,
          data: {},
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await sessions.pruneExpired();

      const left = await raw.session.findMany({
        where: { id: { in: [expired.id, live.id] } },
      });
      expect(left.map((row) => row.id)).toEqual([live.id]);
    });
  });
});

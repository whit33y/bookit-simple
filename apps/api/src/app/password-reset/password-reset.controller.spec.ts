import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import { hash, verify } from 'argon2';
import request from 'supertest';
import { Mail, MailService } from '../../mail/mail.service';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';
import {
  PASSWORD_RESET_GONE,
  PasswordResetService,
} from './password-reset.service';

const OLD_PASSWORD = 'old password 12345';
const NEW_PASSWORD = 'correct horse battery staple';
const HOUR_MS = 60 * 60 * 1000;

describe('Password reset', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  const sent: Mail[] = [];
  /** While set, `MailService.send` waits for it, like a slow SMTP server. */
  let smtpGate: Promise<void> | undefined;
  let app: INestApplication;
  let resets: PasswordResetService;

  const agent = () => request.agent(app.getHttpServer());
  const uniqueEmail = () => `reset-${randomUUID()}@bookit.test`;

  /** A Właściciel of an active Salon who has already set a password. */
  async function createOwner() {
    const salon = await raw.salon.create({
      data: { name: 'Studio Anna', slug: `test-${randomUUID()}` },
    });
    const user = await raw.user.create({
      data: { email: uniqueEmail(), passwordHash: await hash(OLD_PASSWORD) },
    });
    await raw.staffMember.create({
      data: {
        salonId: salon.id,
        userId: user.id,
        role: 'OWNER',
        displayName: 'Anna',
      },
    });
    return { salon, user, email: user.email };
  }

  const login = (
    client: ReturnType<typeof agent>,
    email: string,
    password: string,
  ) => client.post('/api/auth/login').send({ email, password });

  const requestReset = (email: string) =>
    agent().post('/api/auth/password-reset').send({ email });

  const confirm = (token: string, password = NEW_PASSWORD) =>
    agent().post('/api/auth/password-reset/confirm').send({ token, password });

  /** Asks for a reset and returns the token from the link in the e-mail. */
  async function resetToken(email: string): Promise<string> {
    await requestReset(email).expect(202);
    await resets.whenIdle();
    const mail = sent.filter((m) => m.to === email).at(-1);
    const token = /\/reset-hasla\/([\w-]+)/.exec(mail?.text ?? '')?.[1];
    if (!token) throw new Error(`No reset link sent to ${email}`);
    return token;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        send: async (mail: Mail) => {
          await smtpGate;
          sent.push(mail);
        },
      })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    resets = app.get(PasswordResetService);
  });

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  describe('POST /api/auth/password-reset', () => {
    it('e-mails a link valid 1 hour and stores only the hash of its token', async () => {
      const { user, email } = await createOwner();

      const token = await resetToken(email);

      const mail = sent.filter((m) => m.to === email).at(-1);
      expect(mail?.subject).toBe('Zmiana hasła w Bookit');
      expect(mail?.text).toContain(
        `http://localhost:4200/reset-hasla/${token}`,
      );
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
      const [reset] = await raw.passwordReset.findMany({
        where: { userId: user.id },
      });
      expect(reset.tokenHash).toBe(
        createHash('sha256').update(token).digest('hex'),
      );
      expect(JSON.stringify(reset)).not.toContain(token);
      const hours = (reset.expiresAt.getTime() - Date.now()) / HOUR_MS;
      expect(hours).toBeGreaterThan(0.99);
      expect(hours).toBeLessThanOrEqual(1);
    });

    it('finds the account whatever the case and spaces of the e-mail', async () => {
      const { email } = await createOwner();

      await requestReset(`  ${email.toUpperCase()} `).expect(202);
      await resets.whenIdle();

      expect(sent.some((m) => m.to === email)).toBe(true);
    });

    it('replies the same for an existing and an unknown e-mail and sends nothing for the unknown one', async () => {
      const { email } = await createOwner();
      const unknown = uniqueEmail();

      const existing = await requestReset(email).expect(202);
      const missing = await requestReset(unknown).expect(202);
      await resets.whenIdle();

      expect(missing.body).toEqual(existing.body);
      expect(missing.text).toBe(existing.text);
      expect(sent.some((m) => m.to === unknown)).toBe(false);
    });

    it('replies before the account is looked up and the e-mail is sent', async () => {
      const { email } = await createOwner();
      let openGate = () => undefined as void;
      smtpGate = new Promise((resolve) => (openGate = resolve));

      try {
        await requestReset(email).expect(202);
        expect(sent.some((m) => m.to === email)).toBe(false);
      } finally {
        openGate();
        smtpGate = undefined;
      }
      await resets.whenIdle();
      expect(sent.some((m) => m.to === email)).toBe(true);
    });

    it('sends nothing to a person with no place in any Personel', async () => {
      const user = await raw.user.create({
        data: { email: uniqueEmail(), passwordHash: await hash(OLD_PASSWORD) },
      });

      await requestReset(user.email).expect(202);
      await resets.whenIdle();

      expect(sent.some((m) => m.to === user.email)).toBe(false);
    });

    it('e-mails the Administrator, who has no Salon', async () => {
      const user = await raw.user.create({
        data: { email: uniqueEmail(), isAdministrator: true },
      });

      await requestReset(user.email).expect(202);
      await resets.whenIdle();

      expect(sent.some((m) => m.to === user.email)).toBe(true);
    });

    it('turns the previous link of that person into 410', async () => {
      const { email } = await createOwner();
      const oldToken = await resetToken(email);

      const newToken = await resetToken(email);

      expect(newToken).not.toBe(oldToken);
      await confirm(oldToken).expect(410);
      await confirm(newToken).expect(204);
    });

    it('keeps the newer link when two requests race', async () => {
      const { user, email } = await createOwner();
      let openGate = () => undefined as void;
      smtpGate = new Promise((resolve) => (openGate = resolve));

      try {
        await Promise.all([
          requestReset(email).expect(202),
          requestReset(email).expect(202),
        ]);
        // Both links exist before either e-mail goes out.
        while (
          (await raw.passwordReset.count({ where: { userId: user.id } })) < 2
        ) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      } finally {
        openGate();
        smtpGate = undefined;
      }
      await resets.whenIdle();

      const tokens = sent
        .filter((m) => m.to === email)
        .map((m) => /\/reset-hasla\/([\w-]+)/.exec(m.text)?.[1] ?? '');
      const statuses = [];
      for (const token of tokens) statuses.push((await confirm(token)).status);
      expect(statuses.sort()).toEqual([204, 410]);
    });

    it('returns 400 without an e-mail', async () => {
      await agent().post('/api/auth/password-reset').send({}).expect(400);
    });
  });

  describe('POST /api/auth/password-reset/confirm', () => {
    it('sets the new password', async () => {
      const { email } = await createOwner();
      const token = await resetToken(email);

      await confirm(token).expect(204);

      const user = await raw.user.findUniqueOrThrow({ where: { email } });
      expect(await verify(user.passwordHash ?? '', NEW_PASSWORD)).toBe(true);
      await login(agent(), email, NEW_PASSWORD).expect(200);
      await login(agent(), email, OLD_PASSWORD).expect(401);
    });

    it('logs the person out on every device', async () => {
      const { email } = await createOwner();
      const phone = agent();
      const laptop = agent();
      await login(phone, email, OLD_PASSWORD).expect(200);
      await login(laptop, email, OLD_PASSWORD).expect(200);
      const token = await resetToken(email);

      await confirm(token).expect(204);

      await phone.get('/api/auth/me').expect(401);
      await laptop.get('/api/auth/me').expect(401);
    });

    it('works once', async () => {
      const { email } = await createOwner();
      const token = await resetToken(email);
      await confirm(token).expect(204);

      const res = await confirm(token, 'another password 123').expect(410);

      expect(res.body.message).toBe(PASSWORD_RESET_GONE);
      await login(agent(), email, NEW_PASSWORD).expect(200);
    });

    it('accepts the token only once when two requests race', async () => {
      const { email } = await createOwner();
      const token = await resetToken(email);

      const statuses = await Promise.all([
        confirm(token).then((res) => res.status),
        confirm(token, 'another password 123').then((res) => res.status),
      ]);

      expect(statuses.sort()).toEqual([204, 410]);
    });

    it('returns 410 after an hour', async () => {
      const { user, email } = await createOwner();
      const token = await resetToken(email);
      await raw.passwordReset.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await confirm(token).expect(410);
      await login(agent(), email, OLD_PASSWORD).expect(200);
    });

    it('returns 410 for an unknown token', async () => {
      await confirm(randomUUID()).expect(410);
    });

    it('returns 400 for a password shorter than 10 characters and keeps the link', async () => {
      const { email } = await createOwner();
      const token = await resetToken(email);

      await confirm(token, '123456789').expect(400);
      await confirm(token, '1234567890').expect(204);
    });

    it('works for someone logged in as another person', async () => {
      const other = await createOwner();
      const { email } = await createOwner();
      const token = await resetToken(email);
      const client = agent();
      await login(client, other.email, OLD_PASSWORD).expect(200);

      await client
        .post('/api/auth/password-reset/confirm')
        .send({ token, password: NEW_PASSWORD })
        .expect(204);
    });
  });
});

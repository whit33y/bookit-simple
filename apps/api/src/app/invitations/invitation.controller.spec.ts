import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import { verify } from 'argon2';
import { ClsService } from 'nestjs-cls';
import request from 'supertest';
import { Mail, MailService } from '../../mail/mail.service';
import { AppModule } from '../app.module';
import { SALON_SUSPENDED } from '../auth/auth.service';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';
import { INVITATION_GONE, InvitationService } from './invitation.service';

const PASSWORD = 'correct horse battery staple';
const DAY_MS = 86_400_000;

describe('Invitations', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  const sent: Mail[] = [];
  let smtpDown = false;
  let app: INestApplication;
  let invitations: InvitationService;
  let cls: ClsService<SalonContext>;

  const agent = () => request.agent(app.getHttpServer());
  const uniqueEmail = () => `invited-${randomUUID()}@bookit.test`;

  async function createSalon(name = 'Studio Anna') {
    return raw.salon.create({
      data: { name, slug: `test-${randomUUID()}` },
    });
  }

  /** A person added to the Personel, who has not set a password yet. */
  async function createStaffMember(
    salonId: string,
    role: 'OWNER' | 'EMPLOYEE' = 'OWNER',
    displayName = 'Anna',
  ) {
    const user = await raw.user.create({ data: { email: uniqueEmail() } });
    return raw.staffMember.create({
      data: { salonId, userId: user.id, role, displayName },
      include: { user: true },
    });
  }

  function asAdministrator<T>(fn: () => Promise<T>): Promise<T> {
    return cls.run(() => {
      cls.set('isAdministrator', true);
      cls.set('adminScope', true);
      return fn();
    });
  }

  function asStaffMember<T>(
    staffMember: { id: string; salonId: string; role: 'OWNER' | 'EMPLOYEE' },
    fn: () => Promise<T>,
  ): Promise<T> {
    return cls.run(() => {
      cls.set('isAdministrator', false);
      cls.set('salonId', staffMember.salonId);
      cls.set('staffMemberId', staffMember.id);
      cls.set('role', staffMember.role);
      return fn();
    });
  }

  /** The token from the link in the last e-mail sent to `to`. */
  function tokenSentTo(to: string): string {
    const mail = sent.filter((m) => m.to === to).at(-1);
    const token = /\/zaproszenie\/([\w-]+)/.exec(mail?.text ?? '')?.[1];
    if (!token) throw new Error(`No invitation link sent to ${to}`);
    return token;
  }

  /** A Właściciel invited by the Administrator, and the token from the e-mail. */
  async function invitedOwner() {
    const salon = await createSalon();
    const staffMember = await createStaffMember(salon.id);
    await asAdministrator(() => invitations.createFor(staffMember.id));
    const email = staffMember.user?.email ?? '';
    return { salon, staffMember, email, token: tokenSentTo(email) };
  }

  const accept = (
    client: ReturnType<typeof agent>,
    token: string,
    password = PASSWORD,
  ) => client.post('/api/auth/accept-invitation').send({ token, password });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        send: async (mail: Mail) => {
          if (smtpDown) throw new Error('SMTP down');
          sent.push(mail);
        },
      })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    invitations = app.get(InvitationService);
    cls = app.get(ClsService);
  });

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  describe('InvitationService.createFor', () => {
    it('e-mails a link to the invited person and stores only the hash of its token, valid 7 days', async () => {
      const { staffMember, email, token } = await invitedOwner();

      const mail = sent.filter((m) => m.to === email).at(-1);
      expect(mail?.subject).toBe('Zaproszenie do Salonu Studio Anna');
      expect(mail?.text).toContain(
        `http://localhost:4200/zaproszenie/${token}`,
      );
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);

      const [invitation] = await raw.invitation.findMany({
        where: { staffMemberId: staffMember.id },
      });
      expect(invitation.tokenHash).toBe(
        createHash('sha256').update(token).digest('hex'),
      );
      expect(JSON.stringify(invitation)).not.toContain(token);
      const days = (invitation.expiresAt.getTime() - Date.now()) / DAY_MS;
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThanOrEqual(7);
    });

    it('names the Administrator as the one who invites the Właściciel', async () => {
      const { email } = await invitedOwner();

      const mail = sent.filter((m) => m.to === email).at(-1);
      expect(mail?.text).toContain('Administrator Bookit zaprasza Cię');
    });

    it('names the Właściciel who invites a Pracownik', async () => {
      const salon = await createSalon();
      const owner = await createStaffMember(salon.id, 'OWNER', 'Anna');
      const employee = await createStaffMember(salon.id, 'EMPLOYEE', 'Ola');

      await asStaffMember(owner, () => invitations.createFor(employee.id));

      const mail = sent.filter((m) => m.to === employee.user?.email).at(-1);
      expect(mail?.text).toContain('Anna zaprasza Cię');
    });

    it('does not let a Właściciel invite a person from another Salon', async () => {
      const owner = await createStaffMember((await createSalon()).id);
      const stranger = await createStaffMember((await createSalon()).id);

      await expect(
        asStaffMember(owner, () => invitations.createFor(stranger.id)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('turns the previous invitation of that person into 410', async () => {
      const { staffMember, email, token: oldToken } = await invitedOwner();

      await asAdministrator(() => invitations.createFor(staffMember.id));
      const newToken = tokenSentTo(email);

      expect(newToken).not.toBe(oldToken);
      await agent().get(`/api/auth/invitations/${oldToken}`).expect(410);
      await accept(agent(), oldToken).expect(410);
      await agent().get(`/api/auth/invitations/${newToken}`).expect(200);
    });

    it('keeps the previous invitation when the e-mail cannot be sent', async () => {
      const { staffMember, token } = await invitedOwner();

      smtpDown = true;
      await expect(
        asAdministrator(() => invitations.createFor(staffMember.id)),
      ).rejects.toThrow('SMTP down');
      smtpDown = false;

      await agent().get(`/api/auth/invitations/${token}`).expect(200);
    });
  });

  describe('GET /api/auth/invitations/:token', () => {
    it('returns the Salon name and the name of the invited person', async () => {
      const { token } = await invitedOwner();

      await agent()
        .get(`/api/auth/invitations/${token}`)
        .expect(200, { salonName: 'Studio Anna', displayName: 'Anna' });
    });

    it('returns 410 for an unknown token', async () => {
      const res = await agent()
        .get(`/api/auth/invitations/${randomUUID()}`)
        .expect(410);

      expect(res.body.message).toBe(INVITATION_GONE);
    });

    it('returns 410 for an expired token', async () => {
      const { staffMember, token } = await invitedOwner();
      await raw.invitation.updateMany({
        where: { staffMemberId: staffMember.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await agent().get(`/api/auth/invitations/${token}`).expect(410);
      await accept(agent(), token).expect(410);
    });

    it('works for someone logged in to another Salon', async () => {
      const { token } = await invitedOwner();
      const other = await invitedOwner();
      const client = agent();
      await accept(client, other.token).expect(200);

      await client.get(`/api/auth/invitations/${token}`).expect(200);
    });
  });

  describe('POST /api/auth/accept-invitation', () => {
    it('sets the password, uses up the invitation and logs the person in', async () => {
      const { salon, staffMember, email, token } = await invitedOwner();
      const client = agent();

      const res = await accept(client, token).expect(200);

      expect(res.body).toMatchObject({
        user: { email },
        staffMember: { id: staffMember.id, displayName: 'Anna' },
        salon: { id: salon.id },
        role: 'OWNER',
      });
      await client.get('/api/auth/me').expect(200);
      const user = await raw.user.findUniqueOrThrow({ where: { email } });
      expect(await verify(user.passwordHash ?? '', PASSWORD)).toBe(true);
      const [invitation] = await raw.invitation.findMany({
        where: { staffMemberId: staffMember.id },
      });
      expect(invitation.usedAt).toBeInstanceOf(Date);
      await agent()
        .post('/api/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
    });

    it('returns 410 for a used token', async () => {
      const { token } = await invitedOwner();
      await accept(agent(), token).expect(200);

      await agent().get(`/api/auth/invitations/${token}`).expect(410);
      await accept(agent(), token, 'another password 123').expect(410);
    });

    it('accepts the token only once when two requests race', async () => {
      const { token } = await invitedOwner();

      const statuses = await Promise.all([
        accept(agent(), token).then((res) => res.status),
        accept(agent(), token).then((res) => res.status),
      ]);

      expect(statuses.sort()).toEqual([200, 410]);
    });

    it('returns 400 for a password shorter than 10 characters and keeps the invitation', async () => {
      const { token } = await invitedOwner();

      await accept(agent(), token, '123456789').expect(400);
      await accept(agent(), token, '1234567890').expect(200);
    });

    it('returns 400 without a token', async () => {
      await agent()
        .post('/api/auth/accept-invitation')
        .send({ password: PASSWORD })
        .expect(400);
    });

    it('returns 410 once the person was removed from the Personel', async () => {
      const { staffMember, token } = await invitedOwner();
      await raw.staffMember.update({
        where: { id: staffMember.id },
        data: { deletedAt: new Date(), userId: null },
      });

      await agent().get(`/api/auth/invitations/${token}`).expect(410);
      await accept(agent(), token).expect(410);
    });

    it('returns 403 for a suspended Salon and keeps the invitation', async () => {
      const { salon, token } = await invitedOwner();
      await raw.salon.update({
        where: { id: salon.id },
        data: { status: 'SUSPENDED' },
      });

      const res = await accept(agent(), token).expect(403);

      expect(res.body.message).toBe(SALON_SUSPENDED);
      await raw.salon.update({
        where: { id: salon.id },
        data: { status: 'ACTIVE' },
      });
      await accept(agent(), token).expect(200);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  LAST_OWNER,
  STAFF_EMAIL_TAKEN,
  STAFF_INVITATION_ACCEPTED,
  STAFF_ORDER_MISMATCH,
  STAFF_DELETE_SELF,
  STAFF_KEEP_VISITS_REQUIRED,
  STAFF_PHOTO_NOT_FOUND,
  StaffDeletionPreview,
  StaffMemberView,
  VISIT_STAFF_UNAVAILABLE,
} from '@bookit/shared';
import { hash } from 'argon2';
import request from 'supertest';
import { Mail, MailService } from '../../mail/mail.service';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';

const PASSWORD = 'correct horse battery staple';

describe('Personel managed by the Właściciel', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  const sent: Mail[] = [];
  let failMail = false;
  let app: INestApplication;
  let passwordHash: string;

  const unique = () => randomUUID().slice(0, 8);
  const uniqueEmail = () => `staff-${unique()}@bookit.test`;
  /** The token from the last invitation e-mail sent to this address. */
  const invitationToken = (email: string) => {
    const mail = sent.filter((m) => m.to === email).at(-1);
    const token = mail?.text.match(/\/zaproszenie\/([\w-]+)/)?.[1];
    if (!token) throw new Error(`No invitation for ${email}`);
    return token;
  };

  /** A person of the Personel; with `accepted`, they have set the password. */
  async function addStaffMember(
    salonId: string,
    role: 'OWNER' | 'EMPLOYEE',
    { accepted = true, displayName = role as string, sortOrder = 0 } = {},
  ) {
    const email = uniqueEmail();
    const user = await raw.user.create({
      data: { email, passwordHash: accepted ? passwordHash : null },
    });
    const member = await raw.staffMember.create({
      data: { salonId, userId: user.id, role, displayName, sortOrder },
    });
    return { ...member, email };
  }

  async function logIn(email: string) {
    const client = request.agent(app.getHttpServer());
    await client
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return client;
  }

  /** A Salon with a logged-in Właściciel and a logged-in Pracownik. */
  async function salonWithStaff() {
    const salon = await raw.salon.create({
      data: { name: `Studio ${unique()}`, slug: `test-${randomUUID()}` },
    });
    const owner = await addStaffMember(salon.id, 'OWNER', {
      displayName: 'Anna',
      sortOrder: 0,
    });
    const employee = await addStaffMember(salon.id, 'EMPLOYEE', {
      displayName: 'Ola',
      sortOrder: 1,
    });
    return {
      salon,
      owner,
      employee,
      asOwner: await logIn(owner.email),
      asEmployee: await logIn(employee.email),
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        send: async (mail: Mail) => {
          if (failMail) throw new Error('SMTP is down');
          sent.push(mail);
        },
      })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    passwordHash = await hash(PASSWORD);
  });

  afterEach(() => {
    failMail = false;
  });

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  describe('GET /api/staff', () => {
    it('lists the Personel of the own Salon in order, with the invitation status, without removed people', async () => {
      const { salon, owner, employee, asOwner, asEmployee } =
        await salonWithStaff();
      const pending = await addStaffMember(salon.id, 'EMPLOYEE', {
        accepted: false,
        displayName: 'Ela',
        sortOrder: 2,
      });
      await raw.invitation.create({
        data: {
          staffMemberId: pending.id,
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      const expired = await addStaffMember(salon.id, 'EMPLOYEE', {
        accepted: false,
        displayName: 'Iza',
        sortOrder: 3,
      });
      await raw.invitation.create({
        data: {
          staffMemberId: expired.id,
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() - 60_000),
        },
      });
      await raw.staffMember.create({
        data: {
          salonId: salon.id,
          role: 'EMPLOYEE',
          displayName: 'Usunięta',
          deletedAt: new Date(),
        },
      });
      await salonWithStaff(); // another Salon, not listed

      const res = await asOwner.get('/api/staff').expect(200);

      expect(res.body).toEqual([
        {
          id: owner.id,
          displayName: 'Anna',
          email: owner.email,
          role: 'OWNER',
          invitation: 'ACCEPTED',
          acceptsVisits: true,
          showOnPage: true,
          photoId: null,
          bio: null,
        },
        expect.objectContaining({ id: employee.id, role: 'EMPLOYEE' }),
        expect.objectContaining({ id: pending.id, invitation: 'PENDING' }),
        expect.objectContaining({ id: expired.id, invitation: 'EXPIRED' }),
      ] satisfies StaffMemberView[]);
      await asEmployee.get('/api/staff').expect(200);
    });
  });

  describe('POST /api/staff/invite', () => {
    const invite = (client: ReturnType<typeof request.agent>, body: object) =>
      client.post('/api/staff/invite').send(body);

    it('adds the person at the end of the list and e-mails them an invitation from the Właściciel', async () => {
      const { salon, asOwner } = await salonWithStaff();
      const email = uniqueEmail();

      const res = await invite(asOwner, {
        displayName: ' Kasia ',
        email: ` ${email.toUpperCase()} `,
        role: 'EMPLOYEE',
      }).expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        displayName: 'Kasia',
        email,
        role: 'EMPLOYEE',
        invitation: 'PENDING',
        acceptsVisits: true,
        showOnPage: true,
        photoId: null,
        bio: null,
      } satisfies StaffMemberView);
      const member = await raw.staffMember.findUniqueOrThrow({
        where: { id: res.body.id },
        include: { user: true },
      });
      expect(member).toMatchObject({
        salonId: salon.id,
        sortOrder: 2,
        user: { email, passwordHash: null, isAdministrator: false },
      });
      const mail = sent.filter((m) => m.to === email).at(-1);
      expect(mail?.text).toContain('Anna zaprasza Cię');
    });

    it('lets the invited Pracownik set the password and log in to the Salon', async () => {
      const { salon, asOwner } = await salonWithStaff();
      const email = uniqueEmail();
      await invite(asOwner, {
        displayName: 'Kasia',
        email,
        role: 'EMPLOYEE',
      }).expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/auth/accept-invitation')
        .send({ token: invitationToken(email), password: PASSWORD })
        .expect(200);

      expect(res.body).toMatchObject({
        salon: { id: salon.id },
        role: 'EMPLOYEE',
      });
    });

    it('answers 409 for an e-mail that already has an account', async () => {
      const { employee, asOwner } = await salonWithStaff();

      const res = await invite(asOwner, {
        displayName: 'Ola',
        email: employee.email.toUpperCase(),
        role: 'EMPLOYEE',
      }).expect(409);

      expect(res.body.message).toBe(STAFF_EMAIL_TAKEN);
    });

    it.each([
      ['an empty name', { displayName: ' ' }, 'Wpisz imię'],
      ['an invalid e-mail', { email: 'kasia' }, 'Nieprawidłowy e-mail'],
      ['an unknown role', { role: 'ADMIN' }, 'Wybierz rolę'],
    ])('answers 400 for %s', async (_, overrides, message) => {
      const { asOwner } = await salonWithStaff();
      const body = {
        displayName: 'Kasia',
        email: uniqueEmail(),
        role: 'EMPLOYEE',
        ...overrides,
      };

      const res = await invite(asOwner, body).expect(400);

      expect(res.body.message).toBe(message);
    });

    it('creates nothing when the invitation e-mail cannot be sent', async () => {
      const { asOwner } = await salonWithStaff();
      const email = uniqueEmail();
      failMail = true;

      await invite(asOwner, {
        displayName: 'Kasia',
        email,
        role: 'EMPLOYEE',
      }).expect(500);

      expect(await raw.user.count({ where: { email } })).toBe(0);
    });
  });

  describe('PATCH /api/staff/:id', () => {
    it('changes the given fields and returns the person', async () => {
      const { employee, asOwner } = await salonWithStaff();

      const res = await asOwner
        .patch(`/api/staff/${employee.id}`)
        .send({
          displayName: ' Ola K. ',
          acceptsVisits: false,
          showOnPage: false,
          bio: ' Koloryzacja ',
        })
        .expect(200);

      expect(res.body).toMatchObject({
        id: employee.id,
        displayName: 'Ola K.',
        role: 'EMPLOYEE',
        acceptsVisits: false,
        showOnPage: false,
        bio: 'Koloryzacja',
      });
      await asOwner
        .patch(`/api/staff/${employee.id}`)
        .send({ bio: '  ' })
        .expect(200)
        .expect((r) => expect(r.body.bio).toBeNull());
    });

    it('lets the Właściciel make a Pracownik a Właściciel, who then manages the Personel', async () => {
      const { employee, asOwner, asEmployee } = await salonWithStaff();

      await asOwner
        .patch(`/api/staff/${employee.id}`)
        .send({ role: 'OWNER' })
        .expect(200);

      await asEmployee
        .post(`/api/staff/${employee.id}/resend-invitation`)
        .expect(409);
    });

    it('answers 422 when the last Właściciel would lose the role', async () => {
      const { owner, asOwner } = await salonWithStaff();

      const res = await asOwner
        .patch(`/api/staff/${owner.id}`)
        .send({ role: 'EMPLOYEE' })
        .expect(422);

      expect(res.body.message).toBe(LAST_OWNER);
      const after = await raw.staffMember.findUniqueOrThrow({
        where: { id: owner.id },
      });
      expect(after.role).toBe('OWNER');
    });

    it('lets one of two Właściciele give up the role', async () => {
      const { salon, owner, asOwner } = await salonWithStaff();
      await addStaffMember(salon.id, 'OWNER');

      await asOwner
        .patch(`/api/staff/${owner.id}`)
        .send({ role: 'EMPLOYEE' })
        .expect(200);
    });

    it('does not count a removed Właściciel as another one', async () => {
      const { salon, owner, asOwner } = await salonWithStaff();
      await raw.staffMember.create({
        data: {
          salonId: salon.id,
          role: 'OWNER',
          displayName: 'Była',
          deletedAt: new Date(),
        },
      });

      await asOwner
        .patch(`/api/staff/${owner.id}`)
        .send({ role: 'EMPLOYEE' })
        .expect(422);
    });

    it('answers 400 for a photo the Salon does not have', async () => {
      const { employee, asOwner } = await salonWithStaff();

      const res = await asOwner
        .patch(`/api/staff/${employee.id}`)
        .send({ photoId: randomUUID() })
        .expect(400);

      expect(res.body.message).toBe(STAFF_PHOTO_NOT_FOUND);
    });

    it('sets a photo of the Salon and clears it with null', async () => {
      const { salon, employee, asOwner } = await salonWithStaff();
      const photo = await raw.photo.create({
        data: {
          salonId: salon.id,
          storageKey: `test/${randomUUID()}.webp`,
          width: 10,
          height: 10,
          bytes: 100,
        },
      });

      await asOwner
        .patch(`/api/staff/${employee.id}`)
        .send({ photoId: photo.id })
        .expect(200)
        .expect((r) => expect(r.body.photoId).toBe(photo.id));
      await asOwner
        .patch(`/api/staff/${employee.id}`)
        .send({ photoId: null })
        .expect(200)
        .expect((r) => expect(r.body.photoId).toBeNull());
    });

    it('answers 400 for a bad field and 404 for a person of another Salon or a removed one', async () => {
      const { salon, employee, asOwner } = await salonWithStaff();
      const other = await salonWithStaff();
      const removed = await raw.staffMember.create({
        data: {
          salonId: salon.id,
          role: 'EMPLOYEE',
          displayName: 'Usunięta',
          deletedAt: new Date(),
        },
      });

      await asOwner
        .patch(`/api/staff/${employee.id}`)
        .send({ acceptsVisits: 'yes' })
        .expect(400);
      await asOwner
        .patch(`/api/staff/${other.employee.id}`)
        .send({ displayName: 'X' })
        .expect(404);
      await asOwner
        .patch(`/api/staff/${removed.id}`)
        .send({ displayName: 'X' })
        .expect(404);
      await asOwner.patch('/api/staff/not-an-id').send({}).expect(400);
    });
  });

  describe('PUT /api/staff/order', () => {
    it('saves the new order of the Personel', async () => {
      const { salon, owner, employee, asOwner } = await salonWithStaff();
      const third = await addStaffMember(salon.id, 'EMPLOYEE', {
        sortOrder: 2,
      });

      await asOwner
        .put('/api/staff/order')
        .send({ ids: [third.id, owner.id, employee.id] })
        .expect(204);

      const res = await asOwner.get('/api/staff').expect(200);
      expect((res.body as StaffMemberView[]).map((m) => m.id)).toEqual([
        third.id,
        owner.id,
        employee.id,
      ]);
    });

    it('answers 400 unless the list has every person of the Personel exactly once', async () => {
      const { owner, employee, asOwner } = await salonWithStaff();
      const other = await salonWithStaff();

      for (const ids of [
        [owner.id],
        [owner.id, employee.id, employee.id],
        [owner.id, other.employee.id],
        [owner.id, employee.id, other.employee.id],
      ]) {
        const res = await asOwner
          .put('/api/staff/order')
          .send({ ids })
          .expect(400);
        expect(res.body.message).toBe(STAFF_ORDER_MISMATCH);
      }
      await asOwner.put('/api/staff/order').send({}).expect(400);
    });
  });

  describe('POST /api/staff/:id/resend-invitation', () => {
    it('sends a new link and the previous one stops working', async () => {
      const { asOwner } = await salonWithStaff();
      const email = uniqueEmail();
      const { body } = await asOwner
        .post('/api/staff/invite')
        .send({ displayName: 'Kasia', email, role: 'EMPLOYEE' })
        .expect(201);
      const oldToken = invitationToken(email);

      await asOwner.post(`/api/staff/${body.id}/resend-invitation`).expect(204);

      const newToken = invitationToken(email);
      expect(newToken).not.toBe(oldToken);
      const guest = request(app.getHttpServer());
      await guest.get(`/api/auth/invitations/${oldToken}`).expect(410);
      await guest.get(`/api/auth/invitations/${newToken}`).expect(200);
    });

    it('answers 409 once the person has accepted, and 404 for another Salon', async () => {
      const { employee, asOwner } = await salonWithStaff();
      const other = await salonWithStaff();

      const res = await asOwner
        .post(`/api/staff/${employee.id}/resend-invitation`)
        .expect(409);

      expect(res.body.message).toBe(STAFF_INVITATION_ACCEPTED);
      await asOwner
        .post(`/api/staff/${other.employee.id}/resend-invitation`)
        .expect(404);
    });
  });

  describe('removing a person from the Personel', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    /** A Klient with Wizyty of `staffMemberId`, entered by `createdById`, days from now. */
    async function addVisits(
      salonId: string,
      staffMemberId: string,
      createdById: string,
      days: { in: number; state?: 'SCHEDULED' | 'CANCELLED' | 'NO_SHOW' }[],
    ) {
      const client = await raw.client.create({
        data: { salonId, name: 'Łucja', nameNormalized: 'lucja' },
      });
      const visits = [];
      for (const day of days) {
        visits.push(
          await raw.visit.create({
            data: {
              salonId,
              staffMemberId,
              clientId: client.id,
              startsAt: new Date(Date.now() + day.in * DAY_MS),
              durationMin: 60,
              description: 'Strzyżenie',
              state: day.state ?? 'SCHEDULED',
              createdById,
              updatedById: createdById,
            },
          }),
        );
      }
      return { client, visits };
    }

    describe('GET /api/staff/:id/deletion-preview', () => {
      it('counts past and future Wizyty and gives the last scheduled one', async () => {
        const { salon, owner, employee, asOwner } = await salonWithStaff();
        const { visits } = await addVisits(salon.id, employee.id, owner.id, [
          { in: -10 },
          { in: -3, state: 'NO_SHOW' },
          { in: 2 },
          { in: 5 },
          { in: 9, state: 'CANCELLED' },
        ]);
        await addVisits(salon.id, owner.id, owner.id, [{ in: 1 }]);

        const res = await asOwner
          .get(`/api/staff/${employee.id}/deletion-preview`)
          .expect(200);

        expect(res.body).toEqual({
          pastVisits: 2,
          futureVisits: 3,
          lastScheduledVisitAt: visits[3].startsAt.toISOString(),
        } satisfies StaffDeletionPreview);
      });

      it('gives no last Wizyta to a person without scheduled ones, and 404 for another Salon', async () => {
        const { employee, asOwner } = await salonWithStaff();
        const other = await salonWithStaff();

        const res = await asOwner
          .get(`/api/staff/${employee.id}/deletion-preview`)
          .expect(200);

        expect(res.body).toEqual({
          pastVisits: 0,
          futureVisits: 0,
          lastScheduledVisitAt: null,
        });
        await asOwner
          .get(`/api/staff/${other.employee.id}/deletion-preview`)
          .expect(404);
      });
    });

    describe('DELETE /api/staff/:id', () => {
      it('with keepVisits=true drops the account, sessions and invitations, and keeps the name on the Wizyty', async () => {
        const { salon, owner, asOwner } = await salonWithStaff();
        const photo = await raw.photo.create({
          data: {
            salonId: salon.id,
            storageKey: `test/${randomUUID()}`,
            width: 1,
            height: 1,
            bytes: 1,
          },
        });
        const ola = await addStaffMember(salon.id, 'EMPLOYEE', {
          displayName: 'Ola',
        });
        await raw.staffMember.update({
          where: { id: ola.id },
          data: { photoId: photo.id, bio: 'Koloryzacja' },
        });
        await raw.invitation.create({
          data: {
            staffMemberId: ola.id,
            tokenHash: randomUUID(),
            expiresAt: new Date(Date.now() + 60_000),
          },
        });
        await raw.absence.create({
          data: {
            salonId: salon.id,
            staffMemberId: ola.id,
            startsAt: new Date(Date.now() + DAY_MS),
            endsAt: new Date(Date.now() + 2 * DAY_MS),
          },
        });
        const { client, visits } = await addVisits(salon.id, ola.id, owner.id, [
          { in: -5 },
          { in: 3 },
        ]);
        const asOla = await logIn(ola.email);

        await asOwner
          .delete(`/api/staff/${ola.id}?keepVisits=true`)
          .expect(204);

        expect(
          await raw.staffMember.findUniqueOrThrow({ where: { id: ola.id } }),
        ).toMatchObject({
          displayName: 'Ola',
          deletedAt: expect.any(Date),
          userId: null,
          photoId: null,
          bio: null,
          showOnPage: false,
        });
        const userId = ola.userId ?? '';
        expect(await raw.user.count({ where: { id: userId } })).toBe(0);
        expect(await raw.session.count({ where: { userId } })).toBe(0);
        expect(
          await raw.invitation.count({ where: { staffMemberId: ola.id } }),
        ).toBe(0);
        await asOla.get('/api/staff').expect(401);
        // The Klient's past Wizyta still names her.
        const past = await raw.visit.findUniqueOrThrow({
          where: { id: visits[0].id },
          include: { staffMember: { select: { displayName: true } } },
        });
        expect(past).toMatchObject({
          clientId: client.id,
          staffMember: { displayName: 'Ola' },
        });
        expect(
          await raw.visit.count({ where: { staffMemberId: ola.id } }),
        ).toBe(2);
        expect(
          await raw.absence.count({ where: { staffMemberId: ola.id } }),
        ).toBe(1);
        const list = await asOwner.get('/api/staff').expect(200);
        expect(list.body.map((m: StaffMemberView) => m.id)).not.toContain(
          ola.id,
        );
      });

      it('with keepVisits=true lets no new Wizyta be entered for her, but moves an existing one to another person', async () => {
        const { salon, owner, employee, asOwner } = await salonWithStaff();
        const { client, visits } = await addVisits(
          salon.id,
          employee.id,
          owner.id,
          [{ in: 3 }],
        );

        await asOwner
          .delete(`/api/staff/${employee.id}?keepVisits=true`)
          .expect(204);

        const res = await asOwner
          .post('/api/visits')
          .send({
            staffMemberId: employee.id,
            clientId: client.id,
            startsAt: new Date(Date.now() + 4 * DAY_MS).toISOString(),
            durationMin: 60,
            breakMin: 0,
            description: 'Strzyżenie',
            serviceIds: [],
          })
          .expect(422);
        expect(res.body.message).toBe(VISIT_STAFF_UNAVAILABLE);
        await asOwner
          .patch(`/api/visits/${visits[0].id}`)
          .send({ description: 'Farbowanie' })
          .expect(200);
        await asOwner
          .patch(`/api/visits/${visits[0].id}`)
          .send({ staffMemberId: owner.id })
          .expect(200);
        const moved = await raw.visit.findUniqueOrThrow({
          where: { id: visits[0].id },
        });
        expect(moved.staffMemberId).toBe(owner.id);
        await asOwner
          .patch(`/api/visits/${visits[0].id}`)
          .send({ staffMemberId: employee.id })
          .expect(422);
      });

      it('with keepVisits=false also deletes her Wizyty, Nieobecności and their Historia zmian', async () => {
        const { salon, owner, employee, asOwner } = await salonWithStaff();
        const hers = await addVisits(salon.id, employee.id, owner.id, [
          { in: -5 },
          { in: 3, state: 'CANCELLED' },
        ]);
        // A Wizyta she entered for someone else stays.
        const others = await addVisits(salon.id, owner.id, employee.id, [
          { in: 1 },
        ]);
        await raw.absence.create({
          data: {
            salonId: salon.id,
            staffMemberId: employee.id,
            startsAt: new Date(Date.now() + DAY_MS),
            endsAt: new Date(Date.now() + 2 * DAY_MS),
          },
        });
        for (const visit of [...hers.visits, ...others.visits]) {
          await raw.visitChange.create({
            data: {
              salonId: salon.id,
              visitId: visit.id,
              staffMemberId: owner.id,
              action: 'CREATED',
            },
          });
        }

        await asOwner
          .delete(`/api/staff/${employee.id}?keepVisits=false`)
          .expect(204);

        const herIds = hers.visits.map((v) => v.id);
        expect(
          await raw.visit.count({ where: { staffMemberId: employee.id } }),
        ).toBe(0);
        expect(
          await raw.absence.count({ where: { staffMemberId: employee.id } }),
        ).toBe(0);
        expect(
          await raw.visitChange.count({ where: { visitId: { in: herIds } } }),
        ).toBe(0);
        expect(
          await raw.visitChange.count({
            where: { visitId: others.visits[0].id },
          }),
        ).toBe(1);
        expect(
          await raw.visit.count({ where: { id: others.visits[0].id } }),
        ).toBe(1);
        expect(
          await raw.staffMember.findUniqueOrThrow({
            where: { id: employee.id },
          }),
        ).toMatchObject({ displayName: 'Ola', deletedAt: expect.any(Date) });
      });

      it('answers 422 for the Właściciel removing themselves, and lets them remove another Właściciel', async () => {
        const { salon, owner, asOwner } = await salonWithStaff();

        const self = await asOwner
          .delete(`/api/staff/${owner.id}?keepVisits=true`)
          .expect(422);
        expect(self.body.message).toBe(STAFF_DELETE_SELF);

        // With the caller a Właściciel, another Właściciel is never the last one.
        const ewa = await addStaffMember(salon.id, 'OWNER', {
          displayName: 'Ewa',
        });
        await asOwner
          .delete(`/api/staff/${ewa.id}?keepVisits=true`)
          .expect(204);
        expect(
          await raw.staffMember.count({
            where: { salonId: salon.id, role: 'OWNER', deletedAt: null },
          }),
        ).toBe(1);
      });

      it('answers 400 without keepVisits and 404 for another Salon or a removed person', async () => {
        const { employee, asOwner } = await salonWithStaff();
        const other = await salonWithStaff();

        for (const query of ['', '?keepVisits=yes']) {
          const res = await asOwner
            .delete(`/api/staff/${employee.id}${query}`)
            .expect(400);
          expect(res.body.message).toBe(STAFF_KEEP_VISITS_REQUIRED);
        }
        await asOwner
          .delete(`/api/staff/${other.employee.id}?keepVisits=true`)
          .expect(404);
        await asOwner
          .delete(`/api/staff/${employee.id}?keepVisits=true`)
          .expect(204);
        await asOwner
          .delete(`/api/staff/${employee.id}?keepVisits=true`)
          .expect(404);
        await asOwner
          .get(`/api/staff/${employee.id}/deletion-preview`)
          .expect(404);
        expect(
          await raw.staffMember.count({
            where: { id: other.employee.id, deletedAt: null },
          }),
        ).toBe(1);
      });
    });
  });

  describe('a Pracownik', () => {
    it('gets 403 on every /api/staff endpoint but GET, and changes nothing', async () => {
      const { owner, employee, asEmployee } = await salonWithStaff();
      const email = uniqueEmail();

      await asEmployee
        .post('/api/staff/invite')
        .send({ displayName: 'Kasia', email, role: 'EMPLOYEE' })
        .expect(403);
      await asEmployee
        .patch(`/api/staff/${employee.id}`)
        .send({ role: 'OWNER' })
        .expect(403);
      await asEmployee
        .put('/api/staff/order')
        .send({ ids: [employee.id, owner.id] })
        .expect(403);
      await asEmployee
        .post(`/api/staff/${employee.id}/resend-invitation`)
        .expect(403);
      await asEmployee
        .get(`/api/staff/${owner.id}/deletion-preview`)
        .expect(403);
      await asEmployee
        .delete(`/api/staff/${owner.id}?keepVisits=false`)
        .expect(403);

      expect(await raw.user.count({ where: { email } })).toBe(0);
      expect(
        await raw.staffMember.findUniqueOrThrow({ where: { id: employee.id } }),
      ).toMatchObject({ role: 'EMPLOYEE', sortOrder: 1 });
      expect(
        await raw.staffMember.findUniqueOrThrow({ where: { id: owner.id } }),
      ).toMatchObject({ deletedAt: null });
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  AdminSalonDetails,
  AdminSalonSummary,
  ALL_PAGE_SECTIONS,
  CreateSalonRequest,
  DEFAULT_ACCENT_COLOR,
  INVITATION_ALREADY_ACCEPTED,
  OWNER_EMAIL_TAKEN,
  RESEND_SALON_SUSPENDED,
  SLUG_ERROR_MESSAGES,
} from '@bookit/shared';
import { hash } from 'argon2';
import request from 'supertest';
import { Mail, MailService } from '../../mail/mail.service';
import { SALON_SUSPENDED } from '../auth/auth.service';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';

const PASSWORD = 'correct horse battery staple';

describe('Salons managed by the Administrator', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  const sent: Mail[] = [];
  let failMail = false;
  let app: INestApplication;
  let admin: ReturnType<typeof request.agent>;

  const unique = () => randomUUID().slice(0, 8);
  const newSalon = (
    overrides: Partial<CreateSalonRequest> = {},
  ): CreateSalonRequest => {
    const id = unique();
    return {
      name: `Studio ${id}`,
      slug: `studio-${id}`,
      ownerName: 'Anna Kora',
      ownerEmail: `owner-${id}@bookit.test`,
      ...overrides,
    };
  };
  const create = (body: object) => admin.post('/api/admin/salons').send(body);
  const changeSlug = (id: string, body: object) =>
    admin.patch(`/api/admin/salons/${id}`).send(body);
  const slugAvailable = (slug: string) =>
    admin.get('/api/admin/salons/slug-available').query({ slug });
  /** The token from the last invitation e-mail sent to this address. */
  const invitationToken = (email: string) => {
    const mail = sent.filter((m) => m.to === email).at(-1);
    const token = mail?.text.match(/\/zaproszenie\/([\w-]+)/)?.[1];
    if (!token) throw new Error(`No invitation for ${email}`);
    return token;
  };
  /** A new Salon; with `accepted`, its Właściciel has set the password and is logged in. */
  const salonWithOwner = async ({ accepted = false } = {}) => {
    const body = newSalon();
    const res = await create(body).expect(201);
    const ownerEmail = body.ownerEmail.toLowerCase();
    const owner = request.agent(app.getHttpServer());
    if (accepted) {
      await owner
        .post('/api/auth/accept-invitation')
        .send({ token: invitationToken(ownerEmail), password: PASSWORD })
        .expect(200);
    }
    return { id: res.body.id as string, body, ownerEmail, owner };
  };

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

    const email = `admin-${unique()}@bookit.test`;
    await raw.user.create({
      data: {
        email,
        passwordHash: await hash(PASSWORD),
        isAdministrator: true,
      },
    });
    admin = request.agent(app.getHttpServer());
    await admin
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
  });

  afterEach(() => {
    failMail = false;
  });

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  describe('POST /api/admin/salons', () => {
    it('creates the Salon with its Wizytówka defaults and a Właściciel who gets the invitation', async () => {
      const body = newSalon({ ownerEmail: ` Anna.${unique()}@Bookit.test ` });

      const res = await create(body).expect(201);

      const salon = await raw.salon.findUniqueOrThrow({
        where: { slug: body.slug },
        include: {
          staffMembers: { include: { user: true, invitations: true } },
        },
      });
      expect(res.body).toEqual({ id: salon.id, slug: body.slug });
      expect(salon).toMatchObject({
        name: body.name,
        status: 'ACTIVE',
        sections: ALL_PAGE_SECTIONS,
        accentColor: DEFAULT_ACCENT_COLOR,
      });
      expect(salon.privacyNotice).toContain(
        `Administratorem Twoich danych osobowych jest ${body.name}`,
      );

      const [owner] = salon.staffMembers;
      const email = body.ownerEmail.trim().toLowerCase();
      expect(salon.staffMembers).toHaveLength(1);
      expect(owner).toMatchObject({
        role: 'OWNER',
        displayName: 'Anna Kora',
        acceptsVisits: true,
        user: { email, passwordHash: null, isAdministrator: false },
      });
      expect(owner.invitations).toHaveLength(1);

      const mail = sent.find((m) => m.to === email);
      expect(mail?.text).toContain('Administrator Bookit');
      expect(mail?.text).toMatch(/\/zaproszenie\/[\w-]+/);
    });

    it('saves the contact details, the phone in E.164, and puts them in the privacy notice', async () => {
      const body = newSalon({
        phone: '600 123 456',
        email: ' Kontakt@StudioKora.pl ',
        street: 'ul. Piotrkowska 120',
        postalCode: '90-006',
        city: 'Łódź',
      });

      await create(body).expect(201);

      const salon = await raw.salon.findUniqueOrThrow({
        where: { slug: body.slug },
      });
      expect(salon).toMatchObject({
        phone: '+48600123456',
        email: 'kontakt@studiokora.pl',
        street: 'ul. Piotrkowska 120',
        postalCode: '90-006',
        city: 'Łódź',
      });
      expect(salon.privacyNotice).toContain('ul. Piotrkowska 120, 90-006 Łódź');
      expect(salon.privacyNotice).toContain('kontakt@studiokora.pl');
    });

    it('stores empty contact details as null', async () => {
      const body = newSalon({ phone: ' ', email: '', street: '', city: null });

      await create(body).expect(201);

      const salon = await raw.salon.findUniqueOrThrow({
        where: { slug: body.slug },
      });
      expect(salon).toMatchObject({
        phone: null,
        email: null,
        street: null,
        postalCode: null,
        city: null,
      });
    });

    it('answers 409 for an e-mail that already has an account, whatever its case, and creates nothing', async () => {
      const first = newSalon();
      await create(first).expect(201);
      const second = newSalon({ ownerEmail: first.ownerEmail.toUpperCase() });

      const res = await create(second).expect(409);

      expect(res.body.message).toBe(OWNER_EMAIL_TAKEN);
      expect(await raw.salon.count({ where: { slug: second.slug } })).toBe(0);
    });

    it('answers 409 for a taken Adres wizytówki and for an old one kept as a redirect', async () => {
      const taken = newSalon();
      await create(taken).expect(201);
      const salon = await raw.salon.findUniqueOrThrow({
        where: { slug: taken.slug },
      });
      const oldSlug = `stary-${unique()}`;
      await raw.salonSlugRedirect.create({
        data: { oldSlug, salonId: salon.id },
      });

      for (const slug of [taken.slug, oldSlug]) {
        const body = newSalon({ slug });
        const res = await create(body).expect(409);
        expect(res.body.message).toBe(SLUG_ERROR_MESSAGES.TAKEN);
        expect(
          await raw.user.count({ where: { email: body.ownerEmail } }),
        ).toBe(0);
      }
    });

    it.each([
      ['a reserved address', { slug: 'admin' }, SLUG_ERROR_MESSAGES.RESERVED],
      [
        'an invalid address',
        { slug: 'Studio--Kora' },
        SLUG_ERROR_MESSAGES.INVALID,
      ],
      [
        'an invalid phone',
        { phone: '600 123 45' },
        'Nieprawidłowy numer telefonu',
      ],
      [
        'an invalid postal code',
        { postalCode: '90006' },
        'Kod pocztowy wpisz jako 00-000',
      ],
      [
        'an invalid owner e-mail',
        { ownerEmail: 'anna' },
        'Nieprawidłowy e-mail',
      ],
      ['an empty name', { name: '  ' }, 'Wpisz nazwę Salonu'],
      ['an empty owner name', { ownerName: '' }, 'Wpisz imię Właściciela'],
      [
        'a too long street',
        { street: 'a'.repeat(201) },
        'Tekst może mieć najwyżej 200 znaków',
      ],
    ])('answers 400 for %s', async (_, overrides, message) => {
      const body = newSalon(overrides);

      const res = await create(body).expect(400);

      expect(res.body.message).toBe(message);
      expect(await raw.user.count({ where: { email: body.ownerEmail } })).toBe(
        0,
      );
    });

    it('rolls everything back when the invitation e-mail cannot be sent', async () => {
      const body = newSalon();
      failMail = true;

      await create(body).expect(500);

      expect(await raw.salon.count({ where: { slug: body.slug } })).toBe(0);
      expect(await raw.user.count({ where: { email: body.ownerEmail } })).toBe(
        0,
      );
      failMail = false;
      await create(body).expect(201);
    });
  });

  describe('GET /api/admin/salons/slug-available', () => {
    it('says a free address is available', async () => {
      await slugAvailable(`wolny-${unique()}`).expect(200, {
        available: true,
        reason: null,
      });
    });

    it('gives the reason for an address that cannot be used', async () => {
      const taken = newSalon();
      await create(taken).expect(201);
      const salon = await raw.salon.findUniqueOrThrow({
        where: { slug: taken.slug },
      });
      const oldSlug = `stary-${unique()}`;
      await raw.salonSlugRedirect.create({
        data: { oldSlug, salonId: salon.id },
      });

      for (const [slug, reason] of [
        [taken.slug, 'TAKEN'],
        [oldSlug, 'TAKEN'],
        ['panel', 'RESERVED'],
        ['ab', 'TOO_SHORT'],
        ['studio--kora', 'INVALID'],
      ]) {
        await slugAvailable(slug).expect(200, { available: false, reason });
      }
    });

    it('treats a missing slug as too short', async () => {
      await admin
        .get('/api/admin/salons/slug-available')
        .expect(200, { available: false, reason: 'TOO_SHORT' });
    });
  });

  describe('GET /api/admin/salons', () => {
    it('lists Salons newest first with the Właściciel and whether the invitation was accepted', async () => {
      const pending = await salonWithOwner();
      const accepted = await salonWithOwner({ accepted: true });

      const res = await admin.get('/api/admin/salons').expect(200);

      const list = res.body as AdminSalonSummary[];
      const ids = list.map((s) => s.id);
      expect(ids.indexOf(accepted.id)).toBeLessThan(ids.indexOf(pending.id));
      expect(list.find((s) => s.id === pending.id)).toEqual({
        id: pending.id,
        name: pending.body.name,
        slug: pending.body.slug,
        status: 'ACTIVE',
        createdAt: expect.any(String),
        owner: {
          displayName: 'Anna Kora',
          email: pending.ownerEmail,
          invitationAccepted: false,
        },
      });
      expect(list.find((s) => s.id === accepted.id)?.owner).toMatchObject({
        invitationAccepted: true,
      });
    });
  });

  describe('GET /api/admin/salons/:id', () => {
    it('gives the Salon with its contact details', async () => {
      const body = newSalon({ phone: '600 123 456', city: 'Łódź' });
      const { body: created } = await create(body).expect(201);

      const res = await admin
        .get(`/api/admin/salons/${created.id}`)
        .expect(200);

      expect(res.body).toEqual({
        id: created.id,
        name: body.name,
        slug: body.slug,
        status: 'ACTIVE',
        createdAt: expect.any(String),
        owner: {
          displayName: 'Anna Kora',
          email: body.ownerEmail,
          invitationAccepted: false,
        },
        phone: '+48600123456',
        email: null,
        street: null,
        postalCode: null,
        city: 'Łódź',
      } satisfies AdminSalonDetails);
    });

    it('answers 404 for an unknown Salon and 400 for an id that is not a UUID', async () => {
      await admin.get(`/api/admin/salons/${randomUUID()}`).expect(404);
      await admin.get('/api/admin/salons/not-an-id').expect(400);
    });
  });

  describe('suspending and resuming', () => {
    const suspend = (id: string) =>
      admin.post(`/api/admin/salons/${id}/suspend`);
    const resume = (id: string) => admin.post(`/api/admin/salons/${id}/resume`);

    it('logs the Personel out, stops them logging in, and resuming lets them in again', async () => {
      const salon = await salonWithOwner({ accepted: true });
      const other = await salonWithOwner({ accepted: true });
      await salon.owner.get('/api/auth/me').expect(200);

      const res = await suspend(salon.id).expect(200);

      expect(res.body).toMatchObject({ id: salon.id, status: 'SUSPENDED' });
      expect(
        await raw.session.count({
          where: { user: { email: salon.ownerEmail } },
        }),
      ).toBe(0);
      await salon.owner.get('/api/auth/me').expect(401);
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: salon.ownerEmail, password: PASSWORD })
        .expect(403);
      expect(login.body.message).toBe(SALON_SUSPENDED);
      await other.owner.get('/api/auth/me').expect(200);

      const resumed = await resume(salon.id).expect(200);

      expect(resumed.body).toMatchObject({ status: 'ACTIVE' });
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: salon.ownerEmail, password: PASSWORD })
        .expect(200);
    });

    it('does nothing when the Salon already has that status', async () => {
      const { id } = await salonWithOwner();

      await resume(id).expect(200);
      await suspend(id).expect(200);
      const res = await suspend(id).expect(200);

      expect(res.body).toMatchObject({ status: 'SUSPENDED' });
    });

    it('answers 404 for an unknown Salon', async () => {
      await suspend(randomUUID()).expect(404);
      await resume(randomUUID()).expect(404);
    });
  });

  describe('POST /api/admin/salons/:id/resend-invitation', () => {
    const resend = (id: string) =>
      admin.post(`/api/admin/salons/${id}/resend-invitation`);

    it('sends a new link and the previous one stops working', async () => {
      const { id, ownerEmail } = await salonWithOwner();
      const oldToken = invitationToken(ownerEmail);

      await resend(id).expect(204);

      const newToken = invitationToken(ownerEmail);
      expect(newToken).not.toBe(oldToken);
      const guest = request(app.getHttpServer());
      await guest.get(`/api/auth/invitations/${oldToken}`).expect(410);
      await guest.get(`/api/auth/invitations/${newToken}`).expect(200);
    });

    it('answers 409 when the Właściciel already accepted', async () => {
      const { id } = await salonWithOwner({ accepted: true });

      const res = await resend(id).expect(409);

      expect(res.body.message).toBe(INVITATION_ALREADY_ACCEPTED);
    });

    it('answers 409 for a suspended Salon', async () => {
      const { id, ownerEmail } = await salonWithOwner();
      await admin.post(`/api/admin/salons/${id}/suspend`).expect(200);
      const before = sent.length;

      const res = await resend(id).expect(409);

      expect(res.body.message).toBe(RESEND_SALON_SUSPENDED);
      expect(sent.slice(before).some((m) => m.to === ownerEmail)).toBe(false);
    });

    it('answers 404 for an unknown Salon', async () => {
      await resend(randomUUID()).expect(404);
    });
  });

  describe('PATCH /api/admin/salons/:id', () => {
    const redirectsOf = async (salonId: string) =>
      (
        await raw.salonSlugRedirect.findMany({
          where: { salonId },
          orderBy: { oldSlug: 'asc' },
        })
      ).map((r) => r.oldSlug);
    const publicPage = (slug: string) =>
      request(app.getHttpServer())
        .get(`/api/public/pages/${slug}`)
        .redirects(0);

    it('changes the Adres wizytówki and the old one redirects to it', async () => {
      const { id, body } = await salonWithOwner();
      const slug = `nowy-${unique()}`;

      const res = await changeSlug(id, { slug }).expect(200);

      expect(res.body).toMatchObject({ id, slug });
      expect(await redirectsOf(id)).toEqual([body.slug]);
      const moved = await publicPage(body.slug).expect(301);
      expect(moved.headers.location).toBe(`/api/public/pages/${slug}`);
      await publicPage(slug).expect(200);
    });

    it('keeps every earlier address redirecting to the current one', async () => {
      const { id, body } = await salonWithOwner();
      const second = `drugi-${unique()}`;
      const third = `trzeci-${unique()}`;

      await changeSlug(id, { slug: second }).expect(200);
      await changeSlug(id, { slug: third }).expect(200);

      for (const old of [body.slug, second]) {
        const res = await publicPage(old).expect(301);
        expect(res.headers.location).toBe(`/api/public/pages/${third}`);
      }
    });

    it('going back A → B → A leaves no redirect from A', async () => {
      const { id, body } = await salonWithOwner();
      const b = `nowy-${unique()}`;

      await changeSlug(id, { slug: b }).expect(200);
      const res = await changeSlug(id, { slug: body.slug }).expect(200);

      expect(res.body.slug).toBe(body.slug);
      expect(await redirectsOf(id)).toEqual([b]);
      await publicPage(body.slug).expect(200);
      const moved = await publicPage(b).expect(301);
      expect(moved.headers.location).toBe(`/api/public/pages/${body.slug}`);
    });

    it('does nothing for the current address', async () => {
      const { id, body } = await salonWithOwner();

      await changeSlug(id, { slug: body.slug }).expect(200);

      expect(await redirectsOf(id)).toEqual([]);
    });

    it("answers 409 for another Salon's address, current or old, and changes nothing", async () => {
      const other = await salonWithOwner();
      const otherOld = `stary-${unique()}`;
      await raw.salonSlugRedirect.create({
        data: { oldSlug: otherOld, salonId: other.id },
      });
      const { id, body } = await salonWithOwner();

      for (const slug of [other.body.slug, otherOld]) {
        const res = await changeSlug(id, { slug }).expect(409);
        expect(res.body.message).toBe(SLUG_ERROR_MESSAGES.TAKEN);
      }
      const salon = await raw.salon.findUniqueOrThrow({ where: { id } });
      expect(salon.slug).toBe(body.slug);
      expect(await redirectsOf(id)).toEqual([]);
      expect(await redirectsOf(other.id)).toEqual([otherOld]);
    });

    it('gives an address to only one of two requests racing for it', async () => {
      const { id, body } = await salonWithOwner();
      const other = await salonWithOwner();

      // The first frees its address into the redirects while the second claims it.
      const [moved, taken] = await Promise.all([
        changeSlug(id, { slug: `nowy-${unique()}` }),
        changeSlug(other.id, { slug: body.slug }),
      ]);

      expect([moved.status, taken.status].sort()).toEqual([200, 409]);
      const owners =
        (await raw.salon.count({ where: { slug: body.slug } })) +
        (await raw.salonSlugRedirect.count({ where: { oldSlug: body.slug } }));
      expect(owners).toBe(1);
    });

    it('does not let a new Salon take an address that now redirects', async () => {
      const { id, body } = await salonWithOwner();
      await changeSlug(id, { slug: `nowy-${unique()}` }).expect(200);

      const res = await create(newSalon({ slug: body.slug })).expect(409);

      expect(res.body.message).toBe(SLUG_ERROR_MESSAGES.TAKEN);
    });

    it.each([
      ['a reserved address', { slug: 'admin' }, SLUG_ERROR_MESSAGES.RESERVED],
      [
        'an invalid address',
        { slug: 'Studio--Kora' },
        SLUG_ERROR_MESSAGES.INVALID,
      ],
      ['a missing address', {}, SLUG_ERROR_MESSAGES.TOO_SHORT],
    ])('answers 400 for %s', async (_, body, message) => {
      const { id } = await salonWithOwner();

      const res = await changeSlug(id, body).expect(400);

      expect(res.body.message).toBe(message);
    });

    it('answers 404 for an unknown Salon and 400 for an id that is not a UUID', async () => {
      await changeSlug(randomUUID(), { slug: `nowy-${unique()}` }).expect(404);
      await changeSlug('abc', { slug: `nowy-${unique()}` }).expect(400);
    });
  });

  describe('GET /api/admin/salons/slug-available?salonId=', () => {
    it("treats the Salon's own current and old addresses as available to it", async () => {
      const { id, body } = await salonWithOwner();
      const b = `nowy-${unique()}`;
      await changeSlug(id, { slug: b }).expect(200);
      const other = await salonWithOwner();

      for (const slug of [body.slug, b]) {
        await slugAvailable(slug)
          .query({ salonId: id })
          .expect(200, { available: true, reason: null });
      }
      await slugAvailable(other.body.slug)
        .query({ salonId: id })
        .expect(200, { available: false, reason: 'TAKEN' });
      await slugAvailable(body.slug)
        .query({ salonId: other.id })
        .expect(200, { available: false, reason: 'TAKEN' });
    });
  });
});

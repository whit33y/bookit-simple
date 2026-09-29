import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  ALL_PAGE_SECTIONS,
  CreateSalonRequest,
  DEFAULT_ACCENT_COLOR,
  OWNER_EMAIL_TAKEN,
  SLUG_ERROR_MESSAGES,
} from '@bookit/shared';
import { hash } from 'argon2';
import request from 'supertest';
import { Mail, MailService } from '../../mail/mail.service';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';

const PASSWORD = 'correct horse battery staple';

describe('Creating a Salon by the Administrator', () => {
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
  const slugAvailable = (slug: string) =>
    admin.get('/api/admin/salons/slug-available').query({ slug });

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
});

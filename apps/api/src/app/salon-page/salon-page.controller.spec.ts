import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  ACCENT_COLOR_INVALID,
  ALL_PAGE_SECTIONS,
  DEFAULT_ACCENT_COLOR,
  MAP_URL_INVALID,
  PHONE_INVALID,
  POSTAL_CODE_INVALID,
  SALON_EMAIL_INVALID,
  SALON_PHOTO_NOT_FOUND,
  SALON_SECTIONS_INVALID,
  SalonPageSettings,
} from '@bookit/shared';
import { hash } from 'argon2';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';

const PASSWORD = 'correct horse battery staple';

describe('Treść Wizytówki', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  let app: INestApplication;
  let passwordHash: string;

  const unique = () => randomUUID().slice(0, 8);

  async function logIn(email: string) {
    const client = request.agent(app.getHttpServer());
    await client
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return client;
  }

  async function salonWithOwner() {
    const id = unique();
    const salon = await raw.salon.create({
      data: { name: `Studio ${id}`, slug: `studio-${id}` },
    });
    const email = `salon-page-${id}@bookit.test`;
    const user = await raw.user.create({ data: { email, passwordHash } });
    await raw.staffMember.create({
      data: {
        salonId: salon.id,
        userId: user.id,
        role: 'OWNER',
        displayName: 'Anna',
      },
    });
    return { salon, asOwner: await logIn(email) };
  }

  /** A Photo row only; these tests never open the file. */
  function addPhoto(salonId: string) {
    const id = randomUUID();
    return raw.photo.create({
      data: {
        id,
        salonId,
        storageKey: `salons/${salonId}/${id}.webp`,
        width: 10,
        height: 10,
        bytes: 100,
      },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    passwordHash = await hash(PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  describe('GET /api/salon/page', () => {
    it('shows the own Salon, with the defaults for what was never set', async () => {
      const { salon, asOwner } = await salonWithOwner();
      await raw.salon.update({
        where: { id: salon.id },
        data: { sections: { gallery: false, unknown: true, team: 'no' } },
      });

      const res = await asOwner.get('/api/salon/page').expect(200);

      expect(res.body).toEqual({
        name: salon.name,
        slug: salon.slug,
        about: null,
        street: null,
        postalCode: null,
        city: null,
        phone: null,
        email: null,
        mapUrl: null,
        headerLayout: 'CLASSIC',
        accentColor: DEFAULT_ACCENT_COLOR,
        logoPhotoId: null,
        heroPhotoId: null,
        sections: { ...ALL_PAGE_SECTIONS, gallery: false },
        privacyNotice: null,
      } satisfies SalonPageSettings);
    });
  });

  describe('PATCH /api/salon/page', () => {
    it('saves the content, normalized, and the Wizytówka shows it', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const logo = await addPhoto(salon.id);
      const hero = await addPhoto(salon.id);

      const res = await asOwner
        .patch('/api/salon/page')
        .send({
          about: '  Salon w centrum Łodzi  ',
          street: 'ul. Piotrkowska 120',
          postalCode: '90-006',
          city: 'Łódź',
          phone: '600 123 456',
          email: ' Kontakt@StudioKora.pl ',
          mapUrl: 'https://maps.app.goo.gl/abc123',
          accentColor: '#C0392B',
          logoPhotoId: logo.id,
          heroPhotoId: hero.id,
          privacyNotice: 'Administratorem danych jest Studio Kora.',
          name: 'Inna nazwa',
          slug: 'inny-adres',
        })
        .expect(200);

      const saved: SalonPageSettings = {
        name: salon.name,
        slug: salon.slug,
        about: 'Salon w centrum Łodzi',
        street: 'ul. Piotrkowska 120',
        postalCode: '90-006',
        city: 'Łódź',
        phone: '+48600123456',
        email: 'kontakt@studiokora.pl',
        mapUrl: 'https://maps.app.goo.gl/abc123',
        headerLayout: 'CLASSIC',
        accentColor: '#c0392b',
        logoPhotoId: logo.id,
        heroPhotoId: hero.id,
        sections: ALL_PAGE_SECTIONS,
        privacyNotice: 'Administratorem danych jest Studio Kora.',
      };
      expect(res.body).toEqual(saved);
      await asOwner.get('/api/salon/page').expect(200, saved);

      const page = await request(app.getHttpServer())
        .get(`/api/public/pages/${salon.slug}`)
        .expect(200);
      expect(page.body.salon).toMatchObject({
        accentColor: '#c0392b',
        logo: expect.objectContaining({ id: logo.id }),
        hero: expect.objectContaining({ id: hero.id }),
        mapUrl: 'https://maps.app.goo.gl/abc123',
      });
      expect(page.body.privacyNotice).toBe(saved.privacyNotice);
    });

    it.each(['CLASSIC', 'PHOTO_SIDE', 'COMPACT'])(
      'persists header layout %s without changing photos or content',
      async (headerLayout) => {
        const { salon, asOwner } = await salonWithOwner();
        const hero = await addPhoto(salon.id);
        const logo = await addPhoto(salon.id);
        await asOwner
          .patch('/api/salon/page')
          .send({ heroPhotoId: hero.id, logoPhotoId: logo.id, about: 'O nas' })
          .expect(200);
        await asOwner
          .patch('/api/salon/page')
          .send({ headerLayout })
          .expect(200);
        const saved = await asOwner.get('/api/salon/page').expect(200);
        expect(saved.body).toMatchObject({
          headerLayout,
          heroPhotoId: hero.id,
          logoPhotoId: logo.id,
          about: 'O nas',
        });
        await asOwner
          .patch('/api/salon/page')
          .send({ city: 'Łódź' })
          .expect(200);
        const page = await request(app.getHttpServer())
          .get(`/api/public/pages/${salon.slug}`)
          .expect(200);
        expect(page.body.salon).toMatchObject({
          headerLayout,
          hero: { id: hero.id },
          logo: { id: logo.id },
          about: 'O nas',
        });
        await asOwner
          .patch('/api/salon/page')
          .send({ headerLayout: 'CLASSIC' })
          .expect(200);
        const restored = await request(app.getHttpServer())
          .get(`/api/public/pages/${salon.slug}`)
          .expect(200);
        expect(restored.body.salon).toMatchObject({
          headerLayout: 'CLASSIC',
          hero: { id: hero.id },
          logo: { id: logo.id },
          about: 'O nas',
        });
      },
    );

    it.each(['unknown', '', null, 42])(
      'rejects layout %s atomically and preserves the public choice',
      async (headerLayout) => {
        const { salon, asOwner } = await salonWithOwner();
        await asOwner
          .patch('/api/salon/page')
          .send({ headerLayout: 'COMPACT' })
          .expect(200);
        await asOwner
          .patch('/api/salon/page')
          .send({ headerLayout, about: 'Nie zapisze się' })
          .expect(422);
        const page = await request(app.getHttpServer())
          .get(`/api/public/pages/${salon.slug}`)
          .expect(200);
        expect(page.body.salon).toMatchObject({
          headerLayout: 'COMPACT',
          about: null,
        });
      },
    );

    it('changes only the fields sent, and only the sections named', async () => {
      const { asOwner } = await salonWithOwner();
      await asOwner
        .patch('/api/salon/page')
        .send({ city: 'Łódź', sections: { gallery: false, team: false } })
        .expect(200);

      const res = await asOwner
        .patch('/api/salon/page')
        .send({ about: 'O nas', sections: { team: true, hours: false } })
        .expect(200);

      expect(res.body).toMatchObject({
        city: 'Łódź',
        about: 'O nas',
        sections: { ...ALL_PAGE_SECTIONS, gallery: false, hours: false },
      });
    });

    it('clears fields with null or a blank text', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const logo = await addPhoto(salon.id);
      await asOwner
        .patch('/api/salon/page')
        .send({ about: 'O nas', phone: '600123456', logoPhotoId: logo.id })
        .expect(200);

      const res = await asOwner
        .patch('/api/salon/page')
        .send({ about: '  ', phone: null, logoPhotoId: null })
        .expect(200);

      expect(res.body).toMatchObject({
        about: null,
        phone: null,
        logoPhotoId: null,
      });
    });

    it.each([
      ['javascript:', 'javascript:alert(document.cookie)'],
      ['http:', 'http://maps.google.com/?q=Studio'],
      ['no scheme', 'maps.google.com'],
    ])(
      'answers 422 for a mapUrl with %s and keeps the old one',
      async (_, mapUrl) => {
        const { asOwner } = await salonWithOwner();
        await asOwner
          .patch('/api/salon/page')
          .send({ mapUrl: 'https://maps.example/studio' })
          .expect(200);

        const res = await asOwner
          .patch('/api/salon/page')
          .send({ mapUrl, about: 'Nie zapisze się' })
          .expect(422);

        expect(res.body.message).toBe(MAP_URL_INVALID);
        const page = await asOwner.get('/api/salon/page').expect(200);
        expect(page.body).toMatchObject({
          mapUrl: 'https://maps.example/studio',
          about: null,
        });
      },
    );

    it.each([
      ['a phone number too short', { phone: '600 123' }, PHONE_INVALID],
      ['an e-mail without @', { email: 'kontakt' }, SALON_EMAIL_INVALID],
      ['a postal code', { postalCode: '90006' }, POSTAL_CODE_INVALID],
      ['a colour name', { accentColor: 'red' }, ACCENT_COLOR_INVALID],
      ['a short hex colour', { accentColor: '#c03' }, ACCENT_COLOR_INVALID],
      ['no colour', { accentColor: null }, ACCENT_COLOR_INVALID],
      ['a logo id', { logoPhotoId: 'logo' }, SALON_PHOTO_NOT_FOUND],
      [
        'an unknown section',
        { sections: { menu: true } },
        SALON_SECTIONS_INVALID,
      ],
      [
        'a section that is not a boolean',
        { sections: { team: 'yes' } },
        undefined,
      ],
    ])('answers 422 for %s', async (_, body, message) => {
      const { asOwner } = await salonWithOwner();

      const res = await asOwner.patch('/api/salon/page').send(body).expect(422);

      if (message) expect(res.body.message).toBe(message);
    });

    it('answers 422 for a Photo of another Salon', async () => {
      const { asOwner } = await salonWithOwner();
      const other = await salonWithOwner();
      const photo = await addPhoto(other.salon.id);

      const res = await asOwner
        .patch('/api/salon/page')
        .send({ heroPhotoId: photo.id })
        .expect(422);

      expect(res.body.message).toBe(SALON_PHOTO_NOT_FOUND);
    });

    it('does not touch another Salon', async () => {
      const { asOwner } = await salonWithOwner();
      const other = await salonWithOwner();

      await asOwner
        .patch('/api/salon/page')
        .send({ about: 'Nasz salon', accentColor: '#000000' })
        .expect(200);

      const res = await other.asOwner.get('/api/salon/page').expect(200);
      expect(res.body).toMatchObject({
        about: null,
        accentColor: DEFAULT_ACCENT_COLOR,
      });
    });

    it('answers 400 for a body that is not an object', async () => {
      const { asOwner } = await salonWithOwner();

      await asOwner
        .patch('/api/salon/page')
        .set('Content-Type', 'application/json')
        .send('[]')
        .expect(400);
    });
  });
});

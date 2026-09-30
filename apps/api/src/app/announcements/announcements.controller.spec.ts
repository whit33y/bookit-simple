import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  ANNOUNCEMENT_BODY_MAX_LENGTH,
  ANNOUNCEMENT_BODY_REQUIRED,
  ANNOUNCEMENT_BODY_TOO_LONG,
  ANNOUNCEMENT_ENDS_BEFORE_START,
  ANNOUNCEMENT_PHOTO_NOT_FOUND,
  ANNOUNCEMENT_SHOW_FROM_INVALID,
  ANNOUNCEMENT_SHOW_UNTIL_INVALID,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_REQUIRED,
  ANNOUNCEMENT_TITLE_TOO_LONG,
  AnnouncementView,
  CreateAnnouncementRequest,
} from '@bookit/shared';
import { hash } from 'argon2';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';

const PASSWORD = 'correct horse battery staple';
const URL = '/api/announcements';

describe('Ogłoszenia', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  let app: INestApplication;
  let passwordHash: string;

  const unique = () => randomUUID().slice(0, 8);

  async function logIn(salonId: string, role: 'OWNER' | 'EMPLOYEE') {
    const email = `announcements-${unique()}@bookit.test`;
    const user = await raw.user.create({ data: { email, passwordHash } });
    await raw.staffMember.create({
      data: { salonId, userId: user.id, role, displayName: role },
    });
    const client = request.agent(app.getHttpServer());
    await client
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return client;
  }

  async function salonWithOwner() {
    const salon = await raw.salon.create({
      data: { name: `Studio ${unique()}`, slug: `ogloszenia-${unique()}` },
    });
    return { salon, asOwner: await logIn(salon.id, 'OWNER') };
  }

  function addPhoto(salonId: string) {
    const id = randomUUID();
    return raw.photo.create({
      data: {
        id,
        salonId,
        storageKey: `salons/${salonId}/${id}.webp`,
        width: 1600,
        height: 900,
        bytes: 1000,
      },
    });
  }

  function addAnnouncement(
    salonId: string,
    title: string,
    showFrom: string,
    showUntil: string | null = null,
  ) {
    return raw.announcement.create({
      data: {
        salonId,
        title,
        body: 'Treść',
        showFrom: new Date(showFrom),
        showUntil: showUntil ? new Date(showUntil) : null,
      },
    });
  }

  const valid: CreateAnnouncementRequest = {
    title: 'Promocja na koloryzację',
    body: 'Do końca października -20% na koloryzację.',
    showFrom: '2026-10-01',
    showUntil: '2026-10-31',
  };

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

  describe('GET /api/announcements', () => {
    it('lists every Ogłoszenie of the own Salon, past and planned too, newest showFrom first', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const past = await addAnnouncement(
        salon.id,
        'Minione',
        '2020-01-01',
        '2020-01-31',
      );
      const planned = await addAnnouncement(
        salon.id,
        'Zaplanowane',
        '2099-01-01',
      );
      const active = await addAnnouncement(salon.id, 'Aktywne', '2026-01-01');
      const other = await salonWithOwner();
      await addAnnouncement(other.salon.id, 'Obce', '2026-01-01');

      const res = await asOwner.get(URL).expect(200);

      expect((res.body as AnnouncementView[]).map((a) => a.id)).toEqual([
        planned.id,
        active.id,
        past.id,
      ]);
      expect(res.body[2]).toEqual({
        id: past.id,
        title: 'Minione',
        body: 'Treść',
        photoId: null,
        showFrom: '2020-01-01',
        showUntil: '2020-01-31',
      });
    });
  });

  describe('POST /api/announcements', () => {
    it('adds an Ogłoszenie with a Photo of the Salon', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const photo = await addPhoto(salon.id);

      const res = await asOwner
        .post(URL)
        .send({ ...valid, title: '  Promocja  ', photoId: photo.id })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        ...valid,
        title: 'Promocja',
        photoId: photo.id,
      });
      const saved = await raw.announcement.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(saved).toMatchObject({
        salonId: salon.id,
        showFrom: new Date('2026-10-01T00:00:00Z'),
        showUntil: new Date('2026-10-31T00:00:00Z'),
      });
    });

    it('takes no Photo and no end when they are left out', async () => {
      const { asOwner } = await salonWithOwner();

      const res = await asOwner
        .post(URL)
        .send({
          title: 'Nowość',
          body: 'Mamy nowy fotel.',
          showFrom: '2026-10-01',
        })
        .expect(201);

      expect(res.body).toMatchObject({ photoId: null, showUntil: null });
    });

    it('takes showUntil on the same day as showFrom', async () => {
      const { asOwner } = await salonWithOwner();

      await asOwner
        .post(URL)
        .send({ ...valid, showFrom: '2026-11-11', showUntil: '2026-11-11' })
        .expect(201);
    });

    it('answers 422 when showUntil is before showFrom', async () => {
      const { salon, asOwner } = await salonWithOwner();

      const res = await asOwner
        .post(URL)
        .send({ ...valid, showFrom: '2026-10-31', showUntil: '2026-10-30' })
        .expect(422);

      expect(res.body.message).toBe(ANNOUNCEMENT_ENDS_BEFORE_START);
      expect(
        await raw.announcement.count({ where: { salonId: salon.id } }),
      ).toBe(0);
    });

    it.each([
      [{ title: '   ' }, ANNOUNCEMENT_TITLE_REQUIRED],
      [
        { title: 'a'.repeat(ANNOUNCEMENT_TITLE_MAX_LENGTH + 1) },
        ANNOUNCEMENT_TITLE_TOO_LONG,
      ],
      [{ body: undefined }, ANNOUNCEMENT_BODY_REQUIRED],
      [
        { body: 'a'.repeat(ANNOUNCEMENT_BODY_MAX_LENGTH + 1) },
        ANNOUNCEMENT_BODY_TOO_LONG,
      ],
      [{ showFrom: undefined }, ANNOUNCEMENT_SHOW_FROM_INVALID],
      [{ showFrom: '2026-02-30' }, ANNOUNCEMENT_SHOW_FROM_INVALID],
      [
        { showFrom: '2026-10-01T00:00:00+02:00' },
        ANNOUNCEMENT_SHOW_FROM_INVALID,
      ],
      [{ showUntil: '31.10.2026' }, ANNOUNCEMENT_SHOW_UNTIL_INVALID],
      [{ photoId: 'not-a-uuid' }, ANNOUNCEMENT_PHOTO_NOT_FOUND],
    ])('answers 400 for %o', async (change, message) => {
      const { asOwner } = await salonWithOwner();

      const res = await asOwner
        .post(URL)
        .send({ ...valid, ...change })
        .expect(400);

      expect(res.body.message).toBe(message);
    });

    it('takes a title and body of exactly the longest length', async () => {
      const { asOwner } = await salonWithOwner();

      await asOwner
        .post(URL)
        .send({
          ...valid,
          title: 'a'.repeat(ANNOUNCEMENT_TITLE_MAX_LENGTH),
          body: 'b'.repeat(ANNOUNCEMENT_BODY_MAX_LENGTH),
        })
        .expect(201);
    });

    it('answers 400 for a Photo of another Salon', async () => {
      const { asOwner } = await salonWithOwner();
      const other = await salonWithOwner();
      const photo = await addPhoto(other.salon.id);

      const res = await asOwner
        .post(URL)
        .send({ ...valid, photoId: photo.id })
        .expect(400);

      expect(res.body.message).toBe(ANNOUNCEMENT_PHOTO_NOT_FOUND);
    });

    it('is only for the Właściciel', async () => {
      const { salon } = await salonWithOwner();
      const asEmployee = await logIn(salon.id, 'EMPLOYEE');

      await asEmployee.post(URL).send(valid).expect(403);
      await asEmployee.get(URL).expect(403);
    });
  });

  describe('PATCH /api/announcements/:id', () => {
    it('changes only the fields sent', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const photo = await addPhoto(salon.id);
      const announcement = await addAnnouncement(
        salon.id,
        'Promocja',
        '2026-10-01',
        '2026-10-31',
      );

      const res = await asOwner
        .patch(`${URL}/${announcement.id}`)
        .send({ body: 'Nowa treść', photoId: photo.id, showUntil: null })
        .expect(200);

      expect(res.body).toEqual({
        id: announcement.id,
        title: 'Promocja',
        body: 'Nowa treść',
        photoId: photo.id,
        showFrom: '2026-10-01',
        showUntil: null,
      });
    });

    it('removes the Photo with photoId null', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const photo = await addPhoto(salon.id);
      const announcement = await raw.announcement.create({
        data: {
          salonId: salon.id,
          title: 'Z',
          body: 'zdjęciem',
          photoId: photo.id,
          showFrom: new Date('2026-10-01'),
        },
      });

      const res = await asOwner
        .patch(`${URL}/${announcement.id}`)
        .send({ photoId: null })
        .expect(200);

      expect(res.body.photoId).toBeNull();
    });

    it.each([
      ['a showFrom after the saved showUntil', { showFrom: '2026-11-01' }],
      ['a showUntil before the saved showFrom', { showUntil: '2026-09-30' }],
      [
        'both, in the wrong order',
        { showFrom: '2026-12-02', showUntil: '2026-12-01' },
      ],
    ])('answers 422 for %s', async (_, change) => {
      const { salon, asOwner } = await salonWithOwner();
      const announcement = await addAnnouncement(
        salon.id,
        'Promocja',
        '2026-10-01',
        '2026-10-31',
      );

      const res = await asOwner
        .patch(`${URL}/${announcement.id}`)
        .send(change)
        .expect(422);

      expect(res.body.message).toBe(ANNOUNCEMENT_ENDS_BEFORE_START);
      const saved = await raw.announcement.findUniqueOrThrow({
        where: { id: announcement.id },
      });
      expect(saved.showFrom).toEqual(new Date('2026-10-01'));
    });

    it('takes a later showFrom when the Ogłoszenie has no end', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const announcement = await addAnnouncement(
        salon.id,
        'Nowość',
        '2026-10-01',
      );

      const res = await asOwner
        .patch(`${URL}/${announcement.id}`)
        .send({ showFrom: '2027-01-01' })
        .expect(200);

      expect(res.body).toMatchObject({
        showFrom: '2027-01-01',
        showUntil: null,
      });
    });

    it('answers 404 for an Ogłoszenie of another Salon and leaves it as it was', async () => {
      const { asOwner } = await salonWithOwner();
      const other = await salonWithOwner();
      const theirs = await addAnnouncement(
        other.salon.id,
        'Obce',
        '2026-10-01',
      );

      await asOwner
        .patch(`${URL}/${theirs.id}`)
        .send({ title: 'Przejęte' })
        .expect(404);

      const saved = await raw.announcement.findUniqueOrThrow({
        where: { id: theirs.id },
      });
      expect(saved.title).toBe('Obce');
    });
  });

  describe('DELETE /api/announcements/:id', () => {
    it('deletes the Ogłoszenie and keeps its Photo', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const photo = await addPhoto(salon.id);
      const announcement = await raw.announcement.create({
        data: {
          salonId: salon.id,
          title: 'Z',
          body: 'zdjęciem',
          photoId: photo.id,
          showFrom: new Date('2026-10-01'),
        },
      });

      await asOwner.delete(`${URL}/${announcement.id}`).expect(204);

      expect(
        await raw.announcement.findUnique({ where: { id: announcement.id } }),
      ).toBeNull();
      expect(
        await raw.photo.findUnique({ where: { id: photo.id } }),
      ).not.toBeNull();
    });

    it('answers 404 for an Ogłoszenie of another Salon', async () => {
      const { asOwner } = await salonWithOwner();
      const other = await salonWithOwner();
      const theirs = await addAnnouncement(
        other.salon.id,
        'Obce',
        '2026-10-01',
      );

      await asOwner.delete(`${URL}/${theirs.id}`).expect(404);

      expect(
        await raw.announcement.findUnique({ where: { id: theirs.id } }),
      ).not.toBeNull();
    });
  });
});

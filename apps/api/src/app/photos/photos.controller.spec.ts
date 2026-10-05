import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PHOTO_CROP_OUTSIDE,
  PHOTO_FILE_REQUIRED,
  PHOTO_TOO_LARGE,
  PHOTO_UNSUPPORTED_TYPE,
  PhotoView,
} from '@bookit/shared';
import { hash } from 'argon2';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';
import { InMemoryPhotoStorage } from '../../../test/in-memory-photo-storage';
import { PhotoStorage } from './photo-storage';

const PASSWORD = 'correct horse battery staple';
const FIXTURES = join(__dirname, '../../../test/fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, name));

describe('Photos', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  const storage = new InMemoryPhotoStorage();
  let app: INestApplication;
  let passwordHash: string;

  const unique = () => randomUUID().slice(0, 8);

  async function addStaffMember(
    salonId: string,
    role: 'OWNER' | 'EMPLOYEE' = 'OWNER',
  ) {
    const email = `photos-${unique()}@bookit.test`;
    const user = await raw.user.create({ data: { email, passwordHash } });
    const staffMember = await raw.staffMember.create({
      data: { salonId, userId: user.id, role, displayName: 'Anna' },
    });
    const client = request.agent(app.getHttpServer());
    await client
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { client, staffMember };
  }

  /** A Salon with a logged-in Właściciel. */
  async function salonWithOwner() {
    const salon = await raw.salon.create({
      data: { name: `Studio ${unique()}`, slug: `test-${randomUUID()}` },
    });
    const { client, staffMember } = await addStaffMember(salon.id);
    return { salon, asOwner: client, staffMember };
  }

  function upload(
    client: ReturnType<typeof request.agent>,
    file: Buffer,
    filename: string,
    contentType = 'image/jpeg',
  ) {
    return client
      .post('/api/photos')
      .attach('file', file, { filename, contentType });
  }

  /** The stored WebP of an uploaded Photo. */
  async function storedFile(photo: PhotoView) {
    const row = await raw.photo.findUniqueOrThrow({ where: { id: photo.id } });
    const file = storage.files.get(row.storageKey);
    if (!file) throw new Error(`no file under ${row.storageKey}`);
    return { row, ...file };
  }

  /** RGBA of one pixel of the upright image. */
  async function pixel(image: Buffer, left: number, top: number) {
    const { data } = await sharp(image)
      .extract({ left, top, width: 1, height: 1 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return [...data];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PhotoStorage)
      .useValue(storage)
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    passwordHash = await hash(PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  describe('POST /api/photos', () => {
    it('turns a HEIC from an iPhone into a WebP of the Salon', async () => {
      const { salon, asOwner } = await salonWithOwner();

      const res = await upload(
        asOwner,
        fixture('iphone.heic'),
        'IMG_0001.HEIC',
        'image/heic',
      ).expect(201);

      const photo = res.body as PhotoView;
      expect(photo).toEqual({
        id: expect.any(String),
        url: `/api/public/photos/${photo.id}`,
        width: 1280,
        height: 854,
        bytes: expect.any(Number),
      } satisfies PhotoView);
      const { row, body, contentType } = await storedFile(photo);
      expect(row).toMatchObject({
        salonId: salon.id,
        storageKey: `salons/${salon.id}/${photo.id}.webp`,
        width: 1280,
        height: 854,
        bytes: body.length,
      });
      expect(photo.bytes).toBe(body.length);
      expect(contentType).toBe('image/webp');
      expect(await sharp(body).metadata()).toMatchObject({
        format: 'webp',
        width: 1280,
        height: 854,
      });
    });

    it('turns a JPEG upright by its EXIF orientation', async () => {
      const { asOwner } = await salonWithOwner();

      const res = await upload(
        asOwner,
        fixture('rotated-exif-6.jpg'),
        'rotated.jpg',
      ).expect(201);

      expect(res.body).toMatchObject({ width: 20, height: 40 });
      const { body } = await storedFile(res.body);
      const meta = await sharp(body).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 20, height: 40 });
      // Stored with red on the left; upright, red is on top and blue at the bottom.
      const [r, , b] = await pixel(body, 10, 5);
      expect(r).toBeGreaterThan(200);
      expect(b).toBeLessThan(50);
      const [r2, , b2] = await pixel(body, 10, 35);
      expect(r2).toBeLessThan(50);
      expect(b2).toBeGreaterThan(200);
    });

    it('strips EXIF, GPS included, from the WebP', async () => {
      const { asOwner } = await salonWithOwner();
      const jpeg = fixture('rotated-exif-6.jpg');
      expect((await sharp(jpeg).metadata()).exif).toBeDefined();

      const res = await upload(asOwner, jpeg, 'rotated.jpg').expect(201);

      const meta = await sharp((await storedFile(res.body)).body).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.icc).toBeUndefined();
    });

    it('keeps the transparency of a PNG', async () => {
      const { asOwner } = await salonWithOwner();

      const res = await upload(
        asOwner,
        fixture('transparent.png'),
        'logo.png',
        'image/png',
      ).expect(201);

      expect(res.body).toMatchObject({ width: 40, height: 20 });
      const { body } = await storedFile(res.body);
      expect(await sharp(body).metadata()).toMatchObject({
        format: 'webp',
        hasAlpha: true,
      });
      expect((await pixel(body, 5, 10))[3]).toBe(0);
      expect((await pixel(body, 35, 10))[3]).toBe(255);
    });

    it('scales the longer side down to 1600 px, never up', async () => {
      const { asOwner } = await salonWithOwner();
      const wide = await sharp({
        create: {
          width: 3200,
          height: 1000,
          channels: 3,
          background: { r: 200, g: 100, b: 50 },
        },
      })
        .png()
        .toBuffer();

      const res = await upload(asOwner, wide, 'wide.png', 'image/png').expect(
        201,
      );

      expect(res.body).toMatchObject({ width: 1600, height: 500 });
    });

    it('answers 413 with the limit for a file of 11 MB', async () => {
      const { salon, asOwner } = await salonWithOwner();

      const res = await upload(
        asOwner,
        randomBytes(11 * 1024 * 1024),
        'big.jpg',
      ).expect(413);

      expect(res.body.message).toBe(PHOTO_TOO_LARGE);
      expect(await raw.photo.count({ where: { salonId: salon.id } })).toBe(0);
    });

    it('answers 415 for a PDF named .jpg, whatever its Content-Type says', async () => {
      const { salon, asOwner } = await salonWithOwner();

      const res = await upload(
        asOwner,
        fixture('document-pdf.jpg'),
        'photo.jpg',
        'image/jpeg',
      ).expect(415);

      expect(res.body.message).toBe(PHOTO_UNSUPPORTED_TYPE);
      expect(await raw.photo.count({ where: { salonId: salon.id } })).toBe(0);
    });

    it('answers 415 for a JPEG signature with a broken body', async () => {
      const { asOwner } = await salonWithOwner();
      const broken = Buffer.concat([
        fixture('rotated-exif-6.jpg').subarray(0, 64),
        Buffer.alloc(64),
      ]);

      const res = await upload(asOwner, broken, 'broken.jpg').expect(415);

      expect(res.body.message).toBe(PHOTO_UNSUPPORTED_TYPE);
    });

    it('answers 400 without a file', async () => {
      const { asOwner } = await salonWithOwner();

      const res = await asOwner
        .post('/api/photos')
        .field('name', 'x')
        .expect(400);

      expect(res.body.message).toBe(PHOTO_FILE_REQUIRED);
    });
  });

  describe('GET /api/public/photos/:id', () => {
    it('serves the WebP without a login, cached for good', async () => {
      const { asOwner } = await salonWithOwner();
      const photo = (
        await upload(asOwner, fixture('transparent.png'), 'a.png').expect(201)
      ).body as PhotoView;

      const res = await request(app.getHttpServer())
        .get(photo.url)
        .buffer(true)
        .expect(200);

      expect(res.headers['content-type']).toBe('image/webp');
      expect(res.headers['cache-control']).toBe(
        'public, max-age=31536000, immutable',
      );
      expect(Buffer.compare(res.body, (await storedFile(photo)).body)).toBe(0);
    });

    it.each([randomUUID(), 'not-a-uuid'])('answers 404 for %s', async (id) => {
      const res = await request(app.getHttpServer())
        .get(`/api/public/photos/${id}`)
        .expect(404);

      expect(res.headers['cache-control']).toBeUndefined();
    });
  });

  describe('POST /api/photos/:id/crop', () => {
    /** A PNG of `width` × `height`: red on the left half, blue on the right. */
    const halves = (width: number, height: number) =>
      sharp({
        create: { width, height, channels: 3, background: '#ff0000' },
      })
        .composite([
          {
            input: {
              create: {
                width: width / 2,
                height,
                channels: 3,
                background: '#0000ff',
              },
            },
            left: width / 2,
            top: 0,
          },
        ])
        .png()
        .toBuffer();

    async function uploaded(
      client: ReturnType<typeof request.agent>,
      width: number,
      height: number,
    ) {
      const res = await upload(
        client,
        await halves(width, height),
        'portrait.png',
        'image/png',
      ).expect(201);
      return res.body as PhotoView;
    }

    let salon: Awaited<ReturnType<typeof salonWithOwner>>;
    beforeAll(async () => {
      salon = await salonWithOwner();
    });

    it('cuts the square out, scales it to 480 px and drops the source Photo with its file', async () => {
      const source = await uploaded(salon.asOwner, 1200, 1600);
      const { row: sourceRow } = await storedFile(source);
      expect(source).toMatchObject({ width: 1200, height: 1600 });

      const res = await salon.asOwner
        .post(`/api/photos/${source.id}/crop`)
        .send({ x: 100, y: 0, size: 900 })
        .expect(201);

      const photo = res.body as PhotoView;
      expect(photo).toEqual({
        id: expect.any(String),
        url: `/api/public/photos/${photo.id}`,
        width: 480,
        height: 480,
        bytes: expect.any(Number),
      } satisfies PhotoView);
      expect(photo.id).not.toBe(source.id);
      const { row, body, contentType } = await storedFile(photo);
      expect(row).toMatchObject({
        salonId: salon.salon.id,
        width: 480,
        height: 480,
        bytes: body.length,
      });
      expect(contentType).toBe('image/webp');
      expect(await sharp(body).metadata()).toMatchObject({
        format: 'webp',
        width: 480,
        height: 480,
      });
      // 100..1000 of the source: red up to 600, i.e. 5/9 of the square, then blue.
      const [r, , b] = await pixel(body, 200, 240);
      expect(r).toBeGreaterThan(200);
      expect(b).toBeLessThan(50);
      const [r2, , b2] = await pixel(body, 300, 240);
      expect(r2).toBeLessThan(50);
      expect(b2).toBeGreaterThan(200);
      expect(await raw.photo.findUnique({ where: { id: source.id } })).toBe(
        null,
      );
      expect(storage.files.has(sourceRow.storageKey)).toBe(false);
    });

    it.each([
      [1400, 1200],
      [300, 300],
    ])(
      'crops a %i px Zdjęcie Ogłoszenia to %i px and removes the source',
      async (size, side) => {
        const source = await uploaded(salon.asOwner, 1600, 1600);
        const { row } = await storedFile(source);
        const res = await salon.asOwner
          .post(`/api/photos/${source.id}/crop`)
          .send({ x: 0, y: 0, size, purpose: 'announcement' })
          .expect(201);
        expect(res.body).toMatchObject({ width: side, height: side });
        const { body } = await storedFile(res.body);
        expect(await sharp(body).metadata()).toMatchObject({
          format: 'webp',
          width: side,
          height: side,
        });
        await request(app.getHttpServer()).get(source.url).expect(404);
        expect(storage.files.has(row.storageKey)).toBe(false);
      },
    );

    it('never scales a smaller square up', async () => {
      const source = await uploaded(salon.asOwner, 1200, 1600);

      const res = await salon.asOwner
        .post(`/api/photos/${source.id}/crop`)
        .send({ x: 0, y: 0, size: 300 })
        .expect(201);

      expect(res.body).toMatchObject({ width: 300, height: 300 });
      const { body } = await storedFile(res.body);
      expect(await sharp(body).metadata()).toMatchObject({
        width: 300,
        height: 300,
      });
    });

    it.each(
      [
        { x: 400, y: 0, size: 900 },
        { x: 0, y: 1000, size: 700 },
        { x: -1, y: 0, size: 100 },
        { x: 0, y: 0, size: 0 },
      ].flatMap((square) => [square, { ...square, purpose: 'announcement' }]),
    )('answers 400 for a square outside the photo: %j', async (square) => {
      const source = await uploaded(salon.asOwner, 1200, 1600);

      const res = await salon.asOwner
        .post(`/api/photos/${source.id}/crop`)
        .send(square)
        .expect(400);

      expect(res.body.message).toBe(PHOTO_CROP_OUTSIDE);
      await storedFile(source);
    });

    it('rejects recropping a Photo already attached to an Ogłoszenie', async () => {
      const source = await uploaded(salon.asOwner, 1600, 1600);
      const announcement = await salon.asOwner
        .post('/api/announcements')
        .send({
          title: 'A',
          body: 'B',
          showFrom: '2026-10-01',
          photoId: source.id,
        })
        .expect(201);
      await salon.asOwner
        .post(`/api/photos/${source.id}/crop`)
        .send({ x: 0, y: 0, size: 1400, purpose: 'announcement' })
        .expect(400);
      const list = await salon.asOwner.get('/api/announcements').expect(200);
      expect(
        list.body.find((a: { id: string }) => a.id === announcement.body.id)
          .photoId,
      ).toBe(source.id);
      await storedFile(source);
    });

    it('answers 400 for a body that is not a square', async () => {
      const source = await uploaded(salon.asOwner, 1200, 1600);

      await salon.asOwner
        .post(`/api/photos/${source.id}/crop`)
        .send({ x: 'a', y: 0 })
        .expect(400);
    });

    it.each(['profile', 'announcement'])(
      'answers 404 for a Photo of another Salon and keeps it (%s)',
      async (purpose) => {
        const other = await salonWithOwner();
        const source = await uploaded(other.asOwner, 1200, 1600);

        await salon.asOwner
          .post(`/api/photos/${source.id}/crop`)
          .send({ x: 0, y: 0, size: 300, purpose })
          .expect(404);

        await storedFile(source);
      },
    );

    it.each(['profile', 'announcement'])(
      'answers 403 to a Pracownik (%s)',
      async (purpose) => {
        const source = await uploaded(salon.asOwner, 1200, 1600);
        const { client: asEmployee } = await addStaffMember(
          salon.salon.id,
          'EMPLOYEE',
        );

        await asEmployee
          .post(`/api/photos/${source.id}/crop`)
          .send({ x: 0, y: 0, size: 300, purpose })
          .expect(403);

        await storedFile(source);
      },
    );
  });

  describe('DELETE /api/photos/:id', () => {
    it('guards draft cleanup against an already committed save', async () => {
      const { asOwner } = await salonWithOwner();
      const photo = (
        await upload(asOwner, fixture('transparent.png'), 'a.png').expect(201)
      ).body as PhotoView;
      const announcement = await asOwner
        .post('/api/announcements')
        .send({
          title: 'A',
          body: 'B',
          showFrom: '2026-10-01',
          photoId: photo.id,
        })
        .expect(201);
      await asOwner.delete(`/api/photos/${photo.id}?unused=true`).expect(204);
      await request(app.getHttpServer()).get(photo.url).expect(200);
      const list = await asOwner.get('/api/announcements').expect(200);
      expect(
        list.body.find((a: { id: string }) => a.id === announcement.body.id)
          .photoId,
      ).toBe(photo.id);
    });

    it('preserves an Ogłoszenie whose creation commits while draft deletion waits on its Photo', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const photo = (
        await upload(asOwner, fixture('transparent.png'), 'a.png').expect(201)
      ).body as PhotoView;
      let release!: () => void;
      let inserted!: () => void;
      const hold = new Promise<void>((resolve) => (release = resolve));
      const ready = new Promise<void>((resolve) => (inserted = resolve));
      // A database fixture holds the save at its external boundary, like create/checkPhoto.
      const saving = raw.$transaction(
        async (tx) => {
          await tx.photo.findUniqueOrThrow({ where: { id: photo.id } });
          const announcement = await tx.announcement.create({
            data: {
              salonId: salon.id,
              title: 'A',
              body: 'B',
              showFrom: new Date('2026-10-01'),
              photoId: photo.id,
            },
          });
          inserted();
          await hold;
          return announcement;
        },
        { isolationLevel: 'Serializable', timeout: 15000 },
      );
      await ready;
      const deleting = asOwner
        .delete(`/api/photos/${photo.id}?unused=true`)
        .then((response) => response);
      try {
        let blocked = false;
        for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
          const [{ waiting }] = await raw.$queryRaw<
            [{ waiting: boolean }]
          >`SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
              AND state = 'active' AND wait_event_type = 'Lock' AND query LIKE '%DELETE%Photo%'
          ) AS waiting`;
          blocked = waiting;
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(blocked).toBe(true);
      } finally {
        release();
      }
      const [announcement, discarded] = await Promise.all([saving, deleting]);
      expect(discarded.status).toBe(204);
      const list = await asOwner.get('/api/announcements').expect(200);
      expect(
        list.body.find((a: { id: string }) => a.id === announcement.id).photoId,
      ).toBe(photo.id);
      await request(app.getHttpServer()).get(photo.url).expect(200);
      await storedFile(photo);
    });

    it('deletes an unused draft with its file', async () => {
      const { asOwner } = await salonWithOwner();
      const photo = (
        await upload(asOwner, fixture('transparent.png'), 'a.png').expect(201)
      ).body as PhotoView;
      const { row } = await storedFile(photo);
      await asOwner.delete(`/api/photos/${photo.id}?unused=true`).expect(204);
      await request(app.getHttpServer()).get(photo.url).expect(404);
      expect(storage.files.has(row.storageKey)).toBe(false);
    });

    it('deletes the file and the row, and clears every reference to it', async () => {
      const { salon, asOwner, staffMember } = await salonWithOwner();
      const photo = (
        await upload(asOwner, fixture('transparent.png'), 'a.png').expect(201)
      ).body as PhotoView;
      const { row } = await storedFile(photo);
      await raw.salon.update({
        where: { id: salon.id },
        data: { logoPhotoId: photo.id, heroPhotoId: photo.id },
      });
      await raw.staffMember.update({
        where: { id: staffMember.id },
        data: { photoId: photo.id },
      });
      const announcement = await raw.announcement.create({
        data: {
          salonId: salon.id,
          title: 'Nowość',
          body: '',
          photoId: photo.id,
          showFrom: new Date('2026-10-01'),
        },
      });
      await raw.galleryItem.create({
        data: { salonId: salon.id, photoId: photo.id, sortOrder: 0 },
      });

      await asOwner.delete(`/api/photos/${photo.id}`).expect(204);

      expect(await raw.photo.findUnique({ where: { id: photo.id } })).toBe(
        null,
      );
      expect(storage.files.has(row.storageKey)).toBe(false);
      expect(
        await raw.salon.findUniqueOrThrow({ where: { id: salon.id } }),
      ).toMatchObject({ logoPhotoId: null, heroPhotoId: null });
      expect(
        await raw.staffMember.findUniqueOrThrow({
          where: { id: staffMember.id },
        }),
      ).toMatchObject({ photoId: null });
      expect(
        await raw.announcement.findUniqueOrThrow({
          where: { id: announcement.id },
        }),
      ).toMatchObject({ photoId: null });
      expect(
        await raw.galleryItem.count({ where: { salonId: salon.id } }),
      ).toBe(0);
      await request(app.getHttpServer()).get(photo.url).expect(404);
    });

    it('answers 404 to the Właściciel of another Salon and keeps the Photo', async () => {
      const salonA = await salonWithOwner();
      const salonB = await salonWithOwner();
      const photo = (
        await upload(salonA.asOwner, fixture('transparent.png'), 'a.png')
      ).body as PhotoView;
      const { row } = await storedFile(photo);

      await salonB.asOwner.delete(`/api/photos/${photo.id}`).expect(404);

      expect(await raw.photo.findUnique({ where: { id: photo.id } })).toEqual(
        row,
      );
      expect(storage.files.has(row.storageKey)).toBe(true);
    });

    it('answers 404 for an unknown Photo', async () => {
      const { asOwner } = await salonWithOwner();

      await asOwner.delete(`/api/photos/${randomUUID()}`).expect(404);
    });
  });
});

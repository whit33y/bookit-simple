import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
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
import { PhotoStorage } from './photo-storage';

const PASSWORD = 'correct horse battery staple';
const FIXTURES = join(__dirname, '../../../test/fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, name));

/** Keeps files in memory, so the tests run without MinIO, like CI. */
class InMemoryPhotoStorage extends PhotoStorage {
  readonly files = new Map<string, { body: Buffer; contentType: string }>();

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.files.set(key, { body, contentType });
  }

  async get(key: string): Promise<Readable | null> {
    const file = this.files.get(key);
    return file ? Readable.from(file.body) : null;
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }
}

describe('Photos', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  const storage = new InMemoryPhotoStorage();
  let app: INestApplication;
  let passwordHash: string;

  const unique = () => randomUUID().slice(0, 8);

  async function addOwner(salonId: string) {
    const email = `photos-${unique()}@bookit.test`;
    const user = await raw.user.create({ data: { email, passwordHash } });
    const staffMember = await raw.staffMember.create({
      data: { salonId, userId: user.id, role: 'OWNER', displayName: 'Anna' },
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
    const { client, staffMember } = await addOwner(salon.id);
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

  describe('DELETE /api/photos/:id', () => {
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

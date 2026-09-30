import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GALLERY_FULL,
  GALLERY_MAX_PHOTOS,
  GALLERY_ORDER_MISMATCH,
  GALLERY_PHOTO_ALREADY_ADDED,
  GALLERY_PHOTO_NOT_FOUND,
  GalleryPhotoView,
  PhotoView,
} from '@bookit/shared';
import { hash } from 'argon2';
import sharp from 'sharp';
import request from 'supertest';
import { InMemoryPhotoStorage } from '../../../test/in-memory-photo-storage';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { PhotoStorage } from '../photos/photo-storage';
import { createPrismaClient } from '../prisma/prisma.service';

const PASSWORD = 'correct horse battery staple';
const FIXTURES = join(__dirname, '../../../test/fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, name));

type Agent = ReturnType<typeof request.agent>;

describe('Gallery', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  const storage = new InMemoryPhotoStorage();
  let app: INestApplication;
  let passwordHash: string;

  const unique = () => randomUUID().slice(0, 8);

  /** A Salon with a logged-in Właściciel. */
  async function salonWithOwner() {
    const salon = await raw.salon.create({
      data: { name: `Studio ${unique()}`, slug: `test-${randomUUID()}` },
    });
    const email = `gallery-${unique()}@bookit.test`;
    const user = await raw.user.create({ data: { email, passwordHash } });
    await raw.staffMember.create({
      data: {
        salonId: salon.id,
        userId: user.id,
        role: 'OWNER',
        displayName: 'Anna',
      },
    });
    const asOwner = request.agent(app.getHttpServer());
    await asOwner
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { salon, asOwner };
  }

  async function upload(
    client: Agent,
    file: Buffer,
    filename: string,
    contentType: string,
  ): Promise<PhotoView> {
    const res = await client
      .post('/api/photos')
      .attach('file', file, { filename, contentType })
      .expect(201);
    return res.body as PhotoView;
  }

  /** What the web does for every picked file: upload it, then add it to the gallery. */
  async function uploadToGallery(
    client: Agent,
    file: Buffer,
    filename: string,
    contentType = 'image/png',
  ): Promise<GalleryPhotoView> {
    const photo = await upload(client, file, filename, contentType);
    const res = await client
      .post('/api/gallery')
      .send({ photoId: photo.id })
      .expect(201);
    return res.body as GalleryPhotoView;
  }

  /** Photos of the Salon straight in the database, without files; faster than uploading 30. */
  async function photoRows(salonId: string, count: number) {
    return Promise.all(
      Array.from({ length: count }, () =>
        raw.photo.create({
          data: {
            salonId,
            storageKey: `salons/${salonId}/${randomUUID()}.webp`,
            width: 10,
            height: 10,
            bytes: 100,
          },
        }),
      ),
    );
  }

  /** A gallery of `count` Photos, in the order of the returned ids. */
  async function fillGallery(salonId: string, count: number) {
    const photos = await photoRows(salonId, count);
    await raw.galleryItem.createMany({
      data: photos.map((photo, sortOrder) => ({
        salonId,
        photoId: photo.id,
        sortOrder,
      })),
    });
    return photos.map((photo) => photo.id);
  }

  const galleryIds = async (client: Agent) =>
    (
      (await client.get('/api/gallery').expect(200)).body as GalleryPhotoView[]
    ).map((photo) => photo.id);

  const solid = (format: 'jpeg' | 'webp') =>
    sharp({
      create: {
        width: 30,
        height: 20,
        channels: 3,
        background: { r: 10, g: 150, b: 90 },
      },
    })
      [format]()
      .toBuffer();

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

  describe('GET /api/gallery', () => {
    it('is empty for a new Salon', async () => {
      const { asOwner } = await salonWithOwner();

      await asOwner.get('/api/gallery').expect(200, []);
    });

    it('lists the Photos of the Salon in order, not those of another Salon', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const other = await salonWithOwner();
      const [first, second] = await fillGallery(salon.id, 2);
      await fillGallery(other.salon.id, 1);
      await raw.galleryItem.update({
        where: { photoId: first },
        data: { sortOrder: 5 },
      });

      const res = await asOwner.get('/api/gallery').expect(200);

      expect(res.body).toEqual([
        {
          id: second,
          url: `/api/public/photos/${second}`,
          width: 10,
          height: 10,
          bytes: 100,
        },
        expect.objectContaining({ id: first }),
      ] satisfies GalleryPhotoView[]);
    });
  });

  describe('POST /api/gallery', () => {
    // Converting the HEIC alone can take seconds on a busy machine.
    it('adds 5 files uploaded at once, a HEIC among them, in the order they were sent', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const files: [Buffer, string, string][] = [
        [fixture('iphone.heic'), 'IMG_0001.HEIC', 'image/heic'],
        [fixture('rotated-exif-6.jpg'), 'rotated.jpg', 'image/jpeg'],
        [fixture('transparent.png'), 'logo.png', 'image/png'],
        [await solid('jpeg'), 'green.jpg', 'image/jpeg'],
        [await solid('webp'), 'green.webp', 'image/webp'],
      ];

      const added: GalleryPhotoView[] = [];
      for (const [file, name, type] of files) {
        added.push(await uploadToGallery(asOwner, file, name, type));
      }

      expect(await galleryIds(asOwner)).toEqual(added.map((p) => p.id));
      expect(added[0]).toMatchObject({ width: 1280, height: 854 });
      expect(
        await raw.galleryItem.count({ where: { salonId: salon.id } }),
      ).toBe(5);
    }, 30_000);

    it(`answers 422 with the limit for photo number ${GALLERY_MAX_PHOTOS + 1}`, async () => {
      const { salon, asOwner } = await salonWithOwner();
      await fillGallery(salon.id, GALLERY_MAX_PHOTOS - 1);
      await uploadToGallery(asOwner, fixture('transparent.png'), 'last.png');
      const extra = await upload(
        asOwner,
        fixture('transparent.png'),
        'extra.png',
        'image/png',
      );

      const res = await asOwner
        .post('/api/gallery')
        .send({ photoId: extra.id })
        .expect(422);

      expect(res.body.message).toBe(GALLERY_FULL);
      expect(
        await raw.galleryItem.count({ where: { salonId: salon.id } }),
      ).toBe(GALLERY_MAX_PHOTOS);
    });

    it('lets only one of two requests at once take the last place', async () => {
      const { salon, asOwner } = await salonWithOwner();
      await fillGallery(salon.id, GALLERY_MAX_PHOTOS - 1);
      const [a, b] = await photoRows(salon.id, 2);

      const statuses = await Promise.all(
        [a, b].map(
          async (photo) =>
            (await asOwner.post('/api/gallery').send({ photoId: photo.id }))
              .status,
        ),
      );

      expect(statuses.sort()).toEqual([201, 422]);
      expect(
        await raw.galleryItem.count({ where: { salonId: salon.id } }),
      ).toBe(GALLERY_MAX_PHOTOS);
    });

    it('answers 409 for a Photo already in the gallery', async () => {
      const { asOwner } = await salonWithOwner();
      const photo = await uploadToGallery(
        asOwner,
        fixture('transparent.png'),
        'a.png',
      );

      const res = await asOwner
        .post('/api/gallery')
        .send({ photoId: photo.id })
        .expect(409);

      expect(res.body.message).toBe(GALLERY_PHOTO_ALREADY_ADDED);
    });

    it('answers 400 for a Photo of another Salon and adds nothing', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const other = await salonWithOwner();
      const [foreign] = await photoRows(other.salon.id, 1);

      const res = await asOwner
        .post('/api/gallery')
        .send({ photoId: foreign.id })
        .expect(400);

      expect(res.body.message).toBe(GALLERY_PHOTO_NOT_FOUND);
      expect(
        await raw.galleryItem.count({ where: { photoId: foreign.id } }),
      ).toBe(0);
      expect(
        await raw.galleryItem.count({ where: { salonId: salon.id } }),
      ).toBe(0);
    });

    it.each([{}, { photoId: 'nie-uuid' }, { photoId: randomUUID() }])(
      'answers 400 for %j',
      async (body) => {
        const { asOwner } = await salonWithOwner();

        const res = await asOwner.post('/api/gallery').send(body).expect(400);

        expect(res.body.message).toBe(GALLERY_PHOTO_NOT_FOUND);
      },
    );
  });

  describe('DELETE /api/gallery/:photoId', () => {
    it('drops the Photo from the gallery and deletes it with its file', async () => {
      const { asOwner } = await salonWithOwner();
      const kept = await uploadToGallery(
        asOwner,
        fixture('transparent.png'),
        'a.png',
      );
      const removed = await uploadToGallery(
        asOwner,
        fixture('transparent.png'),
        'b.png',
      );
      const { storageKey } = await raw.photo.findUniqueOrThrow({
        where: { id: removed.id },
      });

      await asOwner.delete(`/api/gallery/${removed.id}`).expect(204);

      expect(await galleryIds(asOwner)).toEqual([kept.id]);
      expect(await raw.photo.findUnique({ where: { id: removed.id } })).toBe(
        null,
      );
      expect(storage.files.has(storageKey)).toBe(false);
    });

    it('answers 404 for a Photo of the Salon outside the gallery and keeps it', async () => {
      const { asOwner } = await salonWithOwner();
      const logo = await upload(
        asOwner,
        fixture('transparent.png'),
        'logo.png',
        'image/png',
      );

      await asOwner.delete(`/api/gallery/${logo.id}`).expect(404);

      expect(await raw.photo.findUnique({ where: { id: logo.id } })).not.toBe(
        null,
      );
    });

    it('answers 404 to the Właściciel of another Salon and keeps the Photo', async () => {
      const salonA = await salonWithOwner();
      const salonB = await salonWithOwner();
      const [photoId] = await fillGallery(salonA.salon.id, 1);

      await salonB.asOwner.delete(`/api/gallery/${photoId}`).expect(404);

      expect(await galleryIds(salonA.asOwner)).toEqual([photoId]);
    });
  });

  describe('PUT /api/gallery/order', () => {
    it('saves the new order', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const [a, b, c] = await fillGallery(salon.id, 3);

      await asOwner
        .put('/api/gallery/order')
        .send({ photoIds: [c, a, b] })
        .expect(204);

      expect(await galleryIds(asOwner)).toEqual([c, a, b]);
    });

    it('adds a new Photo after the reordered ones', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const [a, b] = await fillGallery(salon.id, 2);
      await asOwner
        .put('/api/gallery/order')
        .send({ photoIds: [b, a] })
        .expect(204);

      const added = await uploadToGallery(
        asOwner,
        fixture('transparent.png'),
        'c.png',
      );

      expect(await galleryIds(asOwner)).toEqual([b, a, added.id]);
    });

    it('answers 400 for a list that is not the whole gallery exactly once', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const other = await salonWithOwner();
      const [a, b] = await fillGallery(salon.id, 2);
      const [foreign] = await fillGallery(other.salon.id, 1);

      for (const photoIds of [[a], [a, a], [a, b, foreign], [b, foreign]]) {
        const res = await asOwner
          .put('/api/gallery/order')
          .send({ photoIds })
          .expect(400);
        expect(res.body.message).toBe(GALLERY_ORDER_MISMATCH);
      }
      await asOwner.put('/api/gallery/order').send({}).expect(400);

      expect(await galleryIds(asOwner)).toEqual([a, b]);
      expect(await galleryIds(other.asOwner)).toEqual([foreign]);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { ALL_PAGE_SECTIONS, PublicPage, warsawDate } from '@bookit/shared';
import { hash } from 'argon2';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';

/** Every key in `value`, as paths like `categories[].services[].name`. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((item) => keyPaths(item, `${prefix}[]`)))];
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return [path, ...keyPaths(child, path)];
    });
  }
  return [];
}

/** `YYYY-MM-DD` `days` after `day`. */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const day = (value: string) => new Date(`${value}T00:00:00Z`);
const time = (value: string) => new Date(`1970-01-01T${value}:00Z`);

describe('GET /api/public/pages/:slug', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  const today = warsawDate(new Date());
  let app: INestApplication;

  const unique = () => randomUUID().slice(0, 8);
  const page = (slug: string) =>
    request(app.getHttpServer()).get(`/api/public/pages/${slug}`);

  /** A Salon with data the Wizytówka shows and data it must not show. */
  async function createSalon() {
    const id = unique();
    const salon = await raw.salon.create({
      data: {
        name: `Studio ${id}`,
        slug: `studio-${id}`,
        about: 'Salon w centrum Łodzi',
        street: 'ul. Piotrkowska 120',
        postalCode: '90-006',
        city: 'Łódź',
        phone: '+48600123456',
        email: `kontakt-${id}@studio.test`,
        mapUrl: 'https://maps.example/studio',
        accentColor: '#c0392b',
        sections: ALL_PAGE_SECTIONS as object,
        privacyNotice: 'Administratorem danych jest Studio.',
      },
    });
    const salonId = salon.id;
    const photo = (name: string) =>
      raw.photo.create({
        data: {
          salonId,
          storageKey: `${salonId}/${name}-${unique()}`,
          width: 800,
          height: 600,
          bytes: 1000,
        },
      });
    const [logo, hero, anna, promo, gallery1, gallery2] = await Promise.all(
      ['logo', 'hero', 'anna', 'promo', 'gallery1', 'gallery2'].map(photo),
    );
    await raw.salon.update({
      where: { id: salonId },
      data: { logoPhotoId: logo.id, heroPhotoId: hero.id },
    });

    const staffEmail = `anna-${id}@bookit.test`;
    const owner = await raw.staffMember.create({
      data: {
        salon: { connect: { id: salonId } },
        role: 'OWNER',
        displayName: 'Anna',
        bio: 'Fryzjerka od 10 lat',
        photo: { connect: { id: anna.id } },
        sortOrder: 1,
        user: { create: { email: staffEmail, passwordHash: 'secret-hash' } },
      },
    });
    await raw.staffMember.create({
      data: {
        salon: { connect: { id: salonId } },
        role: 'EMPLOYEE',
        displayName: 'Basia',
        sortOrder: 0,
        user: { create: { email: `basia-${id}@bookit.test` } },
      },
    });
    await raw.staffMember.create({
      data: {
        salon: { connect: { id: salonId } },
        role: 'EMPLOYEE',
        displayName: 'Ukryta Celina',
        showOnPage: false,
        user: { create: { email: `celina-${id}@bookit.test` } },
      },
    });
    await raw.staffMember.create({
      data: {
        salonId,
        role: 'EMPLOYEE',
        displayName: 'Usunięta Dorota',
        deletedAt: new Date(),
      },
    });

    const hair = await raw.serviceCategory.create({
      data: { salonId, name: 'Strzyżenie', sortOrder: 0 },
    });
    const nails = await raw.serviceCategory.create({
      data: { salonId, name: 'Paznokcie', sortOrder: 1 },
    });
    const onlyHidden = await raw.serviceCategory.create({
      data: { salonId, name: 'Pusta kategoria', sortOrder: 2 },
    });
    const service = (
      categoryId: string,
      name: string,
      extra: { hidden?: boolean; archivedAt?: Date; sortOrder?: number } = {},
    ) =>
      raw.service.create({
        data: {
          salonId,
          categoryId,
          name,
          description: `${name}: opis`,
          priceGrosze: 8000,
          priceType: 'FROM',
          durationMin: 45,
          breakMin: 15,
          ...extra,
        },
      });
    const cut = await service(hair.id, 'Strzyżenie damskie', { sortOrder: 1 });
    await service(hair.id, 'Strzyżenie męskie', { sortOrder: 0 });
    await service(hair.id, 'Ukryta usługa', { hidden: true });
    await service(hair.id, 'Archiwalna usługa', { archivedAt: new Date() });
    await service(nails.id, 'Manicure hybrydowy');
    await service(onlyHidden.id, 'Druga ukryta usługa', { hidden: true });

    const announcement = (
      title: string,
      showFrom: string,
      showUntil: string | null,
      photoId: string | null = null,
    ) =>
      raw.announcement.create({
        data: {
          salonId,
          title,
          body: `${title}: treść`,
          photoId,
          showFrom: day(showFrom),
          showUntil: showUntil ? day(showUntil) : null,
        },
      });
    await announcement('Promocja', addDays(today, -3), today, promo.id);
    await announcement('Nowość', today, null);
    await announcement('Minione', addDays(today, -10), addDays(today, -1));
    await announcement('Zaplanowane', addDays(today, 1), null);

    await raw.galleryItem.create({
      data: { salonId, photoId: gallery2.id, sortOrder: 1 },
    });
    await raw.galleryItem.create({
      data: { salonId, photoId: gallery1.id, sortOrder: 0 },
    });

    await raw.openingHours.create({
      data: {
        salonId,
        weekday: 6,
        opensAt: time('09:00'),
        closesAt: time('14:00'),
      },
    });
    await raw.openingHours.create({
      data: {
        salonId,
        weekday: 1,
        opensAt: time('10:00'),
        closesAt: time('18:30'),
      },
    });

    const client = await raw.client.create({
      data: {
        salonId,
        name: `Klientka ${id}`,
        phoneE164: '+48600999888',
        notes: 'Lubi kawę',
      },
    });
    await raw.visit.create({
      data: {
        salonId,
        staffMemberId: owner.id,
        clientId: client.id,
        startsAt: new Date(),
        durationMin: 45,
        description: 'Wizyta testowa',
        createdById: owner.id,
        updatedById: owner.id,
        services: {
          create: {
            serviceId: cut.id,
            nameSnapshot: cut.name,
            priceGroszeSnapshot: cut.priceGrosze,
            priceTypeSnapshot: cut.priceType,
          },
        },
      },
    });

    return {
      salon,
      photos: { logo, hero, anna, promo, gallery1, gallery2 },
      staffEmail,
      client,
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  it('returns exactly the fields of the Wizytówka', async () => {
    const { salon } = await createSalon();

    const res = await page(salon.slug).expect(200);

    expect(keyPaths(res.body).sort()).toEqual(
      [
        'salon',
        'salon.name',
        'salon.slug',
        'salon.about',
        'salon.street',
        'salon.postalCode',
        'salon.city',
        'salon.phone',
        'salon.email',
        'salon.mapUrl',
        'salon.accentColor',
        'salon.logoPhotoId',
        'salon.heroPhotoId',
        'sections',
        ...Object.keys(ALL_PAGE_SECTIONS).map((key) => `sections.${key}`),
        'categories',
        'categories[].name',
        'categories[].services',
        'categories[].services[].name',
        'categories[].services[].description',
        'categories[].services[].priceGrosze',
        'categories[].services[].priceType',
        'categories[].services[].durationMin',
        'announcements',
        'announcements[].title',
        'announcements[].body',
        'announcements[].photoId',
        'announcements[].showFrom',
        'announcements[].showUntil',
        'staff',
        'staff[].displayName',
        'staff[].bio',
        'staff[].photoId',
        'gallery',
        'gallery[].photoId',
        'openingHours',
        'openingHours[].weekday',
        'openingHours[].opensAt',
        'openingHours[].closesAt',
        'privacyNotice',
      ].sort(),
    );
  });

  it('has no Personel e-mails, Klienci, Wizyty or hidden Usługi', async () => {
    const { salon, staffEmail, client } = await createSalon();

    const res = await page(salon.slug).expect(200);

    const body = JSON.stringify(res.body);
    for (const secret of [
      staffEmail,
      'secret-hash',
      client.id,
      client.name,
      client.phoneE164 as string,
      'Lubi kawę',
      'Wizyta testowa',
      'Ukryta usługa',
      'Archiwalna usługa',
      'Pusta kategoria',
      'Ukryta Celina',
      'Usunięta Dorota',
      salon.id,
    ]) {
      expect(body).not.toContain(secret);
    }
  });

  it('returns the Wizytówka content in order', async () => {
    const { salon, photos } = await createSalon();

    const res = await page(salon.slug).expect(200);

    const body = res.body as PublicPage;
    expect(body.salon).toMatchObject({
      name: salon.name,
      slug: salon.slug,
      email: salon.email,
      logoPhotoId: photos.logo.id,
      heroPhotoId: photos.hero.id,
    });
    expect(body.sections).toEqual(ALL_PAGE_SECTIONS);
    expect(body.privacyNotice).toBe('Administratorem danych jest Studio.');
    expect(body.categories).toEqual([
      {
        name: 'Strzyżenie',
        services: [
          {
            name: 'Strzyżenie męskie',
            description: 'Strzyżenie męskie: opis',
            priceGrosze: 8000,
            priceType: 'FROM',
            durationMin: 45,
          },
          expect.objectContaining({ name: 'Strzyżenie damskie' }),
        ],
      },
      {
        name: 'Paznokcie',
        services: [expect.objectContaining({ name: 'Manicure hybrydowy' })],
      },
    ]);
    expect(body.announcements).toEqual([
      {
        title: 'Nowość',
        body: 'Nowość: treść',
        photoId: null,
        showFrom: today,
        showUntil: null,
      },
      {
        title: 'Promocja',
        body: 'Promocja: treść',
        photoId: photos.promo.id,
        showFrom: addDays(today, -3),
        showUntil: today,
      },
    ]);
    expect(body.staff).toEqual([
      { displayName: 'Basia', bio: null, photoId: null },
      {
        displayName: 'Anna',
        bio: 'Fryzjerka od 10 lat',
        photoId: photos.anna.id,
      },
    ]);
    expect(body.gallery).toEqual([
      { photoId: photos.gallery1.id },
      { photoId: photos.gallery2.id },
    ]);
    expect(body.openingHours).toEqual([
      { weekday: 1, opensAt: '10:00', closesAt: '18:30' },
      { weekday: 6, opensAt: '09:00', closesAt: '14:00' },
    ]);
  });

  it('lets browsers and proxies cache the page for a minute', async () => {
    const { salon } = await createSalon();

    await page(salon.slug)
      .expect(200)
      .expect('Cache-Control', 'public, max-age=60');
  });

  it('answers an old Adres wizytówki with 301 and the new one', async () => {
    const { salon } = await createSalon();
    const oldSlug = `stare-${unique()}`;
    await raw.salonSlugRedirect.create({
      data: { oldSlug, salonId: salon.id },
    });

    const res = await page(oldSlug).redirects(0).expect(301);

    expect(res.body).toEqual({ slug: salon.slug });
    expect(res.headers.location).toBe(`/api/public/pages/${salon.slug}`);
  });

  it('answers 404 for a suspended Salon', async () => {
    const { salon } = await createSalon();
    await raw.salon.update({
      where: { id: salon.id },
      data: { status: 'SUSPENDED' },
    });

    await page(salon.slug).expect(404);
  });

  it('answers 404 for an unknown address', async () => {
    await page(`nieznany-${unique()}`).expect(404);
  });

  it('shows the page to the Personel of another Salon too', async () => {
    const { salon } = await createSalon();
    const other = await createSalon();
    // Logged in as someone from `other`: the page is still that of `salon`.
    const agent = request.agent(app.getHttpServer());
    await raw.user.update({
      where: { email: other.staffEmail },
      data: { passwordHash: await hash('password') },
    });
    await agent
      .post('/api/auth/login')
      .send({ email: other.staffEmail, password: 'password' })
      .expect(200);

    const res = await agent.get(`/api/public/pages/${salon.slug}`).expect(200);

    expect((res.body as PublicPage).salon.name).toBe(salon.name);
  });
});

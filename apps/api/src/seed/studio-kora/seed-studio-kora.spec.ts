import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  addDays,
  CalendarResponse,
  PublicPage,
  warsawDate,
  warsawDayBounds,
  warsawTime,
} from '@bookit/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { InMemoryPhotoStorage } from '../../../test/in-memory-photo-storage';
import { AppModule } from '../../app/app.module';
import { configureApp } from '../../app/configure-app';
import { PhotoStorage } from '../../app/photos/photo-storage';
import { createPrismaClient } from '../../app/prisma/prisma.service';
import { mondayOf, removeSalon, seedStudioKora } from './seed-studio-kora';

const PASSWORD = 'studio-kora-test';
// The real clock: the Wizytówka shows the Ogłoszenie by today's date, not the seed's.
const NOW = new Date();
const TODAY = warsawDate(NOW);
const MONDAY = mondayOf(TODAY);

jest.setTimeout(120_000);

describe('seedStudioKora', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  const storage = new InMemoryPhotoStorage();
  // Its own address and e-mails, so the developer's Studio Kora stays untouched.
  const tag = randomUUID().slice(0, 8);
  const options = {
    password: PASSWORD,
    now: NOW,
    slug: `kora-${tag}`,
    emailDomain: `kora-${tag}.test`,
  };
  let app: INestApplication;
  let salonId: string;
  let emails: string[];

  /** Everything the seed writes, without ids and timestamps, which differ per run. */
  async function contents(id: string) {
    const salon = await raw.salon.findUniqueOrThrow({
      where: { id },
      include: {
        logoPhoto: true,
        heroPhoto: true,
        staffMembers: {
          include: { user: true },
          orderBy: { sortOrder: 'asc' },
        },
        serviceCategories: {
          include: { services: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
        openingHours: { orderBy: { weekday: 'asc' } },
        announcements: true,
        clients: { orderBy: { name: 'asc' } },
        galleryItems: {
          include: { photo: true },
          orderBy: { sortOrder: 'asc' },
        },
        absences: { include: { staffMember: true } },
        visits: {
          include: {
            staffMember: true,
            client: true,
            services: { orderBy: { nameSnapshot: 'asc' } },
          },
          // The Kolizja shares its start with another Wizyta: insertion order breaks the tie.
          orderBy: [
            { startsAt: 'asc' },
            { staffMember: { sortOrder: 'asc' } },
            { createdAt: 'asc' },
          ],
        },
        visitChanges: true,
        photos: true,
      },
    });
    const size = (photo: { width: number; height: number } | null) =>
      photo && `${photo.width}x${photo.height}`;
    return {
      name: salon.name,
      address: [salon.street, salon.postalCode, salon.city, salon.phone],
      logo: size(salon.logoPhoto),
      hero: size(salon.heroPhoto),
      staff: salon.staffMembers.map((member) => [
        member.displayName,
        member.role,
        member.user?.email,
        member.bio,
      ]),
      pricing: salon.serviceCategories.map((category) => [
        category.name,
        category.services.map((service) => [
          service.name,
          service.priceGrosze,
          service.priceType,
          service.durationMin,
          service.breakMin,
        ]),
      ]),
      hours: salon.openingHours.map((hours) => [
        hours.weekday,
        hours.opensAt,
        hours.closesAt,
      ]),
      announcements: salon.announcements.map((announcement) => [
        announcement.title,
        announcement.showFrom,
        announcement.showUntil,
      ]),
      clients: salon.clients.map((client) => [
        client.name,
        client.phoneE164,
        client.notes,
      ]),
      gallery: salon.galleryItems.map((item) => size(item.photo)),
      absences: salon.absences.map((absence) => [
        absence.staffMember.displayName,
        absence.startsAt,
        absence.endsAt,
      ]),
      visits: salon.visits.map((visit) => [
        visit.staffMember.displayName,
        visit.client.name,
        visit.startsAt,
        visit.durationMin,
        visit.breakMin,
        visit.description,
        visit.state,
        visit.services.map((service) => service.nameSnapshot),
      ]),
      changes: salon.visitChanges.map((change) => change.action).sort(),
      photoCount: salon.photos.length,
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PhotoStorage)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    ({ salonId, emails } = await seedStudioKora(raw, storage, options));
  });

  afterAll(async () => {
    await removeSalon(raw, storage, options.slug, emails);
    await raw.$disconnect();
    await app.close();
  });

  it('gives the same Salon on a second run, with nothing doubled', async () => {
    const first = await contents(salonId);

    const second = await seedStudioKora(raw, storage, options);
    salonId = second.salonId;

    expect(await contents(salonId)).toEqual(first);
    expect(await raw.salon.count({ where: { slug: options.slug } })).toBe(1);
    expect(await raw.user.count({ where: { email: { in: emails } } })).toBe(4);
    // The files of the first run's Photos are gone with it.
    expect(storage.files.size).toBe(first.photoCount);
  });

  it('lets Magda log in and see Wizyty in the current week', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ email: `magda@${options.emailDomain}`, password: PASSWORD })
      .expect(200);

    const { body } = await agent
      .get('/api/calendar')
      .query({ from: MONDAY, to: addDays(MONDAY, 6) })
      .expect(200);
    const calendar = body as CalendarResponse;

    expect(calendar.staff.map((member) => member.displayName)).toEqual([
      'Magda',
      'Kasia',
      'Ola',
      'Natalia',
    ]);
    expect(calendar.visits.length).toBeGreaterThan(20);
    expect(calendar.absences).toHaveLength(1);
  });

  it('shows the Cennik, the Ogłoszenie, the Zespół and the gallery on the Wizytówka', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`/api/public/pages/${options.slug}`)
      .expect(200);
    const page = body as PublicPage;

    expect(page.categories.map((category) => category.name)).toEqual([
      'Strzyżenie',
      'Koloryzacja',
      'Paznokcie',
      'Twarz i brwi',
    ]);
    expect(
      page.categories.flatMap((category) => category.services),
    ).toHaveLength(16);
    expect(page.announcements.map((a) => a.title)).toEqual([
      'Nowość: laminacja brwi',
    ]);
    // From today to the end of the month.
    expect(page.announcements[0].showFrom).toBe(TODAY);
    expect(page.announcements[0].showUntil?.slice(0, 7)).toBe(
      TODAY.slice(0, 7),
    );
    expect(addDays(page.announcements[0].showUntil ?? '', 1).slice(8)).toBe(
      '01',
    );
    expect(page.staff.map((member) => member.displayName)).toHaveLength(4);
    expect(page.gallery).toHaveLength(6);
    expect(page.salon.logo).not.toBeNull();
    expect(page.salon.hero).not.toBeNull();
    // The HEIC came through the converter like any upload: an upright WebP of its size.
    expect(page.gallery[5]).toMatchObject({ width: 1280, height: 854 });
    await request(app.getHttpServer())
      .get(`/api/public/photos/${page.gallery[5].id}`)
      .expect(200)
      .expect('Content-Type', 'image/webp');
  });

  describe('Klienci', () => {
    it('are 30, five with no phone and one pair sharing a number', async () => {
      const clients = await raw.client.findMany({ where: { salonId } });
      const phones = clients.map((client) => client.phoneE164);
      const counts = new Map<string, number>();
      for (const phone of phones) {
        if (phone) counts.set(phone, (counts.get(phone) ?? 0) + 1);
      }

      expect(clients).toHaveLength(30);
      expect(phones.filter((phone) => phone === null)).toHaveLength(5);
      expect([...counts.values()].filter((count) => count > 1)).toEqual([2]);
    });
  });

  describe('Wizyty', () => {
    const occupied = (visit: {
      startsAt: Date;
      durationMin: number;
      breakMin: number;
    }) => ({
      start: visit.startsAt.getTime(),
      end:
        visit.startsAt.getTime() +
        (visit.durationMin + visit.breakMin) * 60_000,
    });

    it('have exactly one Kolizja', async () => {
      const visits = await raw.visit.findMany({
        where: { salonId, state: 'SCHEDULED' },
      });
      const absences = await raw.absence.findMany({ where: { salonId } });
      let collisions = 0;
      for (const [i, a] of visits.entries()) {
        for (const b of visits.slice(i + 1)) {
          const x = occupied(a);
          const y = occupied(b);
          if (
            a.staffMemberId === b.staffMemberId &&
            x.start < y.end &&
            y.start < x.end
          )
            collisions++;
        }
        for (const absence of absences) {
          const x = occupied(a);
          if (
            a.staffMemberId === absence.staffMemberId &&
            x.start < absence.endsAt.getTime() &&
            absence.startsAt.getTime() < x.end
          )
            collisions++;
        }
      }

      expect(collisions).toBe(1);
    });

    it('fill the current and the next week within the Godziny otwarcia', async () => {
      const visits = await raw.visit.findMany({
        where: { salonId, state: 'SCHEDULED' },
      });
      const { startsAt: weekStart } = warsawDayBounds(MONDAY);
      const { endsAt: nextWeekEnd } = warsawDayBounds(addDays(MONDAY, 13));

      for (const visit of visits) {
        expect(
          visit.startsAt >= weekStart && visit.startsAt < nextWeekEnd,
        ).toBe(true);
        const end = new Date(occupied(visit).end);
        expect(warsawTime(visit.startsAt) >= '09:00').toBe(true);
        expect(warsawTime(end) <= '19:00').toBe(true);
      }
      const nextWeek = visits.filter(
        (visit) =>
          visit.startsAt >= warsawDayBounds(addDays(MONDAY, 7)).startsAt,
      );
      expect(nextWeek.length).toBeGreaterThan(20);
    });

    it('include Wizyty with no Usługa and Wizyty with a Przerwa', async () => {
      const visits = await raw.visit.findMany({
        where: { salonId },
        include: { services: true },
      });

      expect(visits.some((visit) => visit.services.length === 0)).toBe(true);
      expect(visits.some((visit) => visit.services.length > 1)).toBe(true);
      expect(visits.some((visit) => visit.breakMin > 0)).toBe(true);
    });

    it('leave Natalia away all Friday', async () => {
      const natalia = await raw.staffMember.findFirstOrThrow({
        where: { salonId, displayName: 'Natalia' },
      });
      const friday = warsawDayBounds(addDays(MONDAY, 4));

      expect(
        await raw.absence.findMany({
          where: { salonId },
          select: { staffMemberId: true, startsAt: true, endsAt: true },
        }),
      ).toEqual([{ staffMemberId: natalia.id, ...friday }]);
      expect(
        await raw.visit.count({
          where: {
            staffMemberId: natalia.id,
            startsAt: { gte: friday.startsAt, lt: friday.endsAt },
          },
        }),
      ).toBe(0);
    });

    it('have one CANCELLED and one NO_SHOW in the past', async () => {
      const missed = await raw.visit.findMany({
        where: { salonId, state: { not: 'SCHEDULED' } },
      });

      expect(missed.map((visit) => visit.state).sort()).toEqual([
        'CANCELLED',
        'NO_SHOW',
      ]);
      for (const visit of missed) expect(visit.startsAt < NOW).toBe(true);
    });

    it('are in the Historia zmian', async () => {
      const visits = await raw.visit.count({ where: { salonId } });

      expect(
        await raw.visitChange.count({ where: { salonId, action: 'CREATED' } }),
      ).toBe(visits);
    });
  });
});

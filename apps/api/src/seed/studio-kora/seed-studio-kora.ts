import {
  addDays,
  CalendarDay,
  normalizeName,
  parsePhone,
  polishHolidays,
  warsawDate,
  warsawDayBounds,
  warsawInstant,
} from '@bookit/shared';
import { hash } from 'argon2';
import { ClsService } from 'nestjs-cls';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient, Service } from '../../generated/prisma/client';
import { fromCalendarDay } from '../../app/announcements/calendar-day-column';
import { fromClockTime } from '../../app/opening-hours/clock-time';
import { PhotoStorage } from '../../app/photos/photo-storage';
import { PhotosService } from '../../app/photos/photos.service';
import { PrismaService } from '../../app/prisma/prisma.service';
import { SalonContext } from '../../app/salon-context/salon-context';
import { salonIsolation } from '../../app/salon-context/salon-isolation.extension';
import { VisitChangeRecorder } from '../../app/visit-changes/visit-change-recorder';
import { VisitsService } from '../../app/visits/visits.service';
import { SeededRandom, seededRandom } from './seeded-random';
import {
  ANNOUNCEMENT,
  CATEGORIES,
  CategoryKey,
  CLIENT_COUNT,
  CLIENT_NOTES,
  CLIENTS_WITHOUT_PHONE,
  COMBOS,
  DESCRIPTIONS_WITHOUT_SERVICES,
  FIRST_NAMES,
  LAST_NAMES,
  OPENING_HOURS,
  SHARED_PHONE_PAIR,
  STAFF,
  STAFF_EMAIL_DOMAIN,
  StaffKey,
  STUDIO_KORA,
} from './studio-kora-data';
import { PORTRAIT_CROP, studioKoraPhotoFiles } from './studio-kora-photos';

/** Same seed, same Klienci and Wizyty: two runs in one week give the same Salon. */
const RANDOM_SEED = 37;

const MOBILE_PREFIXES = [
  '50',
  '51',
  '53',
  '57',
  '60',
  '66',
  '69',
  '72',
  '73',
  '78',
  '79',
  '88',
];

export interface StudioKoraOptions {
  /** Of every person from the Personel (`SEED_PASSWORD`). */
  password: string;
  /** Wizyty fill the week of this instant and the next one. */
  now?: Date;
  /** Tests seed their own copy, so they never touch the Studio Kora of the developer. */
  slug?: string;
  emailDomain?: string;
}

export interface SeededStudioKora {
  salonId: string;
  emails: string[];
}

/**
 * Studio Kora from docs/mvp.md, section 9, rebuilt from scratch on every run: the old
 * Salon goes with its accounts and Photo files first, so nothing is doubled. Photos
 * and Wizyty go through `PhotosService` and `VisitsService`, the code behind the api,
 * so they are processed, checked for Kolizje and written to the Historia zmian.
 */
export async function seedStudioKora(
  prisma: PrismaClient,
  storage: PhotoStorage,
  {
    password,
    now = new Date(),
    slug = STUDIO_KORA.slug,
    emailDomain = STAFF_EMAIL_DOMAIN,
  }: StudioKoraOptions,
): Promise<SeededStudioKora> {
  const emails = STAFF.map((member) => `${member.key}@${emailDomain}`);
  await removeSalon(prisma, storage, slug, emails);

  const random = seededRandom(RANDOM_SEED);
  const today = warsawDate(now);
  const salon = await prisma.salon.create({
    data: { ...STUDIO_KORA, slug },
  });
  const salonId = salon.id;

  const passwordHash = await hash(password);
  const staffIds = {} as Record<StaffKey, string>;
  for (const [index, member] of STAFF.entries()) {
    const { id } = await prisma.staffMember.create({
      data: {
        salon: { connect: { id: salonId } },
        role: member.role,
        displayName: member.displayName,
        bio: member.bio,
        sortOrder: index,
        user: { create: { email: emails[index], passwordHash } },
      },
    });
    staffIds[member.key] = id;
  }

  const pricing = await createPricing(prisma, salonId);
  await prisma.openingHours.createMany({
    data: OPENING_HOURS.map((hours) => ({
      salonId,
      weekday: hours.weekday,
      opensAt: fromClockTime(hours.opensAt),
      closesAt: fromClockTime(hours.closesAt),
    })),
  });
  await prisma.announcement.create({
    data: {
      salonId,
      ...ANNOUNCEMENT,
      showFrom: fromCalendarDay(today),
      showUntil: fromCalendarDay(lastDayOfMonth(today)),
    },
  });
  const clientIds = await createClients(prisma, salonId, random);

  const cls = new ClsService<SalonContext>(new AsyncLocalStorage());
  const db = prisma.$extends(salonIsolation(cls)) as unknown as PrismaService;
  const photos = new PhotosService(db, storage, cls);
  const visits = new VisitsService(db, cls, new VisitChangeRecorder(cls));

  // As Magda at the reception desk: she is in the Historia zmian of every Wizyta.
  await cls.runWith(
    { salonId, staffMemberId: staffIds.magda, role: 'OWNER' },
    async () => {
      const files = await studioKoraPhotoFiles();
      const logo = await photos.upload(files.logo);
      const hero = await photos.upload(files.hero);
      for (const [sortOrder, file] of files.gallery.entries()) {
        const photo = await photos.upload(file);
        await db.galleryItem.create({
          data: { salonId, photoId: photo.id, sortOrder },
        });
      }
      await db.salon.update({
        where: { id: salonId },
        data: { logoPhotoId: logo.id, heroPhotoId: hero.id },
      });
      // Uploaded and cropped, as the Właściciel does in the dialog of the Personel.
      for (const [key, file] of Object.entries(files.portraits)) {
        const upload = await photos.upload(file);
        const photo = await photos.crop(upload.id, PORTRAIT_CROP);
        await db.staffMember.update({
          where: { id: staffIds[key as StaffKey] },
          data: { photoId: photo.id },
        });
      }

      await new VisitPlanner(
        visits,
        db,
        salonId,
        staffIds,
        pricing,
        clientIds,
        random,
      ).plan(today);
    },
  );

  return { salonId, emails };
}

/** The Salon with this address, its accounts and the files of its Photos. */
export async function removeSalon(
  prisma: PrismaClient,
  storage: PhotoStorage,
  slug: string,
  emails: string[],
): Promise<void> {
  const salon = await prisma.salon.findUnique({
    where: { slug },
    include: {
      photos: { select: { storageKey: true } },
      staffMembers: { select: { userId: true } },
    },
  });
  const userIds = (salon?.staffMembers ?? [])
    .map((member) => member.userId)
    .filter((id) => id !== null);
  await prisma.$transaction([
    // Wizyty first: their Usługi (`VisitService`) would hold the Cennik back.
    prisma.visit.deleteMany({ where: { salon: { slug } } }),
    // Cascades to the rest with its `salonId`, the Historia zmian included.
    prisma.salon.deleteMany({ where: { slug } }),
    prisma.user.deleteMany({
      where: {
        isAdministrator: false,
        OR: [{ id: { in: userIds } }, { email: { in: emails } }],
      },
    }),
  ]);
  for (const { storageKey } of salon?.photos ?? []) {
    await storage.delete(storageKey);
  }
}

type PricingByCategory = Record<CategoryKey, Service[]>;

async function createPricing(
  prisma: PrismaClient,
  salonId: string,
): Promise<PricingByCategory> {
  const pricing = {} as PricingByCategory;
  for (const [sortOrder, category] of CATEGORIES.entries()) {
    const created = await prisma.serviceCategory.create({
      data: {
        salonId,
        name: category.name,
        sortOrder,
        services: {
          create: category.services.map((service, index) => ({
            salonId,
            name: service.name,
            priceGrosze: service.priceZl * 100,
            priceType: service.priceType,
            durationMin: service.durationMin,
            breakMin: service.breakMin,
            sortOrder: index,
          })),
        },
      },
      include: { services: { orderBy: { sortOrder: 'asc' } } },
    });
    pricing[category.key] = created.services;
  }
  return pricing;
}

/**
 * `CLIENT_COUNT` Klienci with Polish names: `CLIENTS_WITHOUT_PHONE` with no phone and
 * the `SHARED_PHONE_PAIR` on one number. Returns their ids in the order drawn.
 */
async function createClients(
  prisma: PrismaClient,
  salonId: string,
  random: SeededRandom,
): Promise<string[]> {
  const names = new Set<string>(SHARED_PHONE_PAIR);
  while (names.size < CLIENT_COUNT) {
    const first = random.pick(FIRST_NAMES);
    const [female, male] = random.pick(LAST_NAMES);
    names.add(`${first} ${first.endsWith('a') ? female : male}`);
  }
  const drawn = [...names].slice(SHARED_PHONE_PAIR.length);

  const phones = new Set<string>();
  const newPhone = (): string => {
    for (;;) {
      const digits = Array.from({ length: 7 }, () => random.int(0, 9)).join('');
      const phone = parsePhone(`${random.pick(MOBILE_PREFIXES)}${digits}`);
      if (phone && !phones.has(phone.e164)) {
        phones.add(phone.e164);
        return phone.e164;
      }
    }
  };

  const withoutPhone = new Set<number>();
  while (withoutPhone.size < CLIENTS_WITHOUT_PHONE) {
    withoutPhone.add(random.int(0, drawn.length - 1));
  }
  const sharedPhone = newPhone();
  const clients = [
    ...SHARED_PHONE_PAIR.map((name) => ({ name, phoneE164: sharedPhone })),
    ...drawn.map((name, index) => ({
      name,
      phoneE164: withoutPhone.has(index) ? null : newPhone(),
    })),
  ].map((client) => ({
    ...client,
    salonId,
    nameNormalized: normalizeName(client.name),
    notes: random.next() < 0.2 ? random.pick(CLIENT_NOTES) : null,
  }));

  const created = await prisma.client.createManyAndReturn({
    data: clients,
    select: { id: true, name: true },
  });
  // `createManyAndReturn` does not promise the order of the input.
  return clients.map((client) => {
    const row = created.find((candidate) => candidate.name === client.name);
    if (!row) throw new Error(`Klient ${client.name} was not saved`);
    return row.id;
  });
}

/** `YYYY-MM-DD` of the last day in the month of `day`. */
function lastDayOfMonth(day: CalendarDay): CalendarDay {
  const [year, month] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** Monday of the week of `day`. */
export function mondayOf(day: CalendarDay): CalendarDay {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/** 1 = Monday ... 7 = Sunday, like `OpeningHours.weekday`. */
const weekdayOf = (day: CalendarDay) =>
  ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

const minutesOf = (clock: string) => {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
};

const clockOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

interface PlannedVisit {
  serviceIds: string[];
  durationMin: number;
  breakMin: number;
  description: string | null;
}

/**
 * The Wizyty of the current and the next week: each person's day filled from opening to
 * closing with gaps, Usługi of their Kategorie, sometimes two at once or none. Sundays
 * and Święta stay empty. On top: Natalia away on Friday, one Kolizja on purpose, and
 * one `CANCELLED` and one `NO_SHOW` Wizyta in the week before.
 */
class VisitPlanner {
  private nextClient = 0;

  constructor(
    private readonly visits: VisitsService,
    private readonly db: PrismaService,
    private readonly salonId: string,
    private readonly staffIds: Record<StaffKey, string>,
    private readonly pricing: PricingByCategory,
    private readonly clientIds: string[],
    private readonly random: SeededRandom,
  ) {}

  async plan(today: CalendarDay): Promise<void> {
    const monday = mondayOf(today);
    const holidays = new Set(
      [-1, 0, 1]
        .map((offset) => Number(monday.slice(0, 4)) + offset)
        .flatMap((year) => polishHolidays(year).map((holiday) => holiday.date)),
    );
    const isOpen = (day: CalendarDay) =>
      !holidays.has(day) &&
      OPENING_HOURS.some((hours) => hours.weekday === weekdayOf(day));

    const friday = addDays(monday, 4);
    await this.db.absence.create({
      data: {
        salonId: this.salonId,
        staffMemberId: this.staffIds.natalia,
        ...warsawDayBounds(friday),
        reason: 'Urlop',
      },
    });

    const days = Array.from({ length: 14 }, (_, i) =>
      addDays(monday, i),
    ).filter(isOpen);
    const firstVisits = new Map<CalendarDay, Date>();
    for (const day of days) {
      for (const member of STAFF) {
        if (member.key === 'natalia' && day === friday) continue;
        const first = await this.fillDay(day, member.key, member.categories);
        if (member.key === 'kasia' && first) firstVisits.set(day, first);
      }
    }

    // A walk-in squeezed onto Kasia's first Wizyta, saved with "Zapisz mimo to".
    const collisionDay =
      days.find(
        (day) =>
          day >= today && day < addDays(monday, 7) && firstVisits.has(day),
      ) ?? days.find((day) => firstVisits.has(day));
    const taken = collisionDay && firstVisits.get(collisionDay);
    if (taken) {
      await this.visits.create({
        staffMemberId: this.staffIds.kasia,
        clientId: this.client(),
        // The same start overlaps whatever her first Wizyta is, even a 10-minute one.
        startsAt: taken,
        durationMin: 10,
        breakMin: 0,
        serviceIds: [this.service('haircut', 'Grzywka').id],
        description: 'Klientka weszła bez zapisu',
        acceptCollisions: true,
      });
    }

    const lastWeek = Array.from({ length: 7 }, (_, i) =>
      addDays(monday, i - 7),
    ).filter(isOpen);
    const missed = [
      { state: 'CANCELLED', staffKey: 'ola', day: lastWeek[0] },
      { state: 'NO_SHOW', staffKey: 'magda', day: lastWeek[1] },
    ] as const;
    for (const { state, staffKey, day } of missed) {
      const member = STAFF.find((candidate) => candidate.key === staffKey);
      const visit = await this.visits.create({
        staffMemberId: this.staffIds[staffKey],
        clientId: this.client(),
        startsAt: warsawInstant(day, '10:00'),
        ...this.drawVisit(member?.categories ?? []),
        acceptCollisions: false,
      });
      await this.visits.changeState(visit.id, state);
    }
  }

  /** The start of the first Wizyta, if the day got one. */
  private async fillDay(
    day: CalendarDay,
    staffMember: StaffKey,
    categories: CategoryKey[],
  ): Promise<Date | null> {
    const hours = OPENING_HOURS.find((h) => h.weekday === weekdayOf(day));
    if (!hours) return null;
    const closes = minutesOf(hours.closesAt);
    let cursor =
      minutesOf(hours.opensAt) + this.random.pick([0, 0, 15, 30, 60]);
    let first: Date | null = null;
    for (;;) {
      const visit = this.drawVisit(categories);
      if (cursor + visit.durationMin + visit.breakMin > closes) break;
      const startsAt = warsawInstant(day, clockOf(cursor));
      await this.visits.create({
        staffMemberId: this.staffIds[staffMember],
        clientId: this.client(),
        startsAt,
        ...visit,
        acceptCollisions: false,
      });
      first ??= startsAt;
      cursor +=
        visit.durationMin +
        visit.breakMin +
        this.random.pick([0, 0, 15, 30, 45, 90]);
    }
    return first;
  }

  /** Usługi with the time the form would suggest, or none with a description. */
  private drawVisit(categories: CategoryKey[]): PlannedVisit {
    const roll = this.random.next();
    if (roll < 0.1) {
      return {
        serviceIds: [],
        durationMin: this.random.pick([15, 30]),
        breakMin: this.random.pick([0, 5]),
        description: this.random.pick(DESCRIPTIONS_WITHOUT_SERVICES),
      };
    }
    const own = categories.flatMap((key) => this.pricing[key]);
    const combos = COMBOS.filter((names) =>
      names.every((name) => own.some((service) => service.name === name)),
    );
    const combo =
      roll < 0.25 && combos.length > 0 ? this.random.pick(combos) : null;
    const chosen = combo
      ? own.filter((service) => combo.includes(service.name))
      : [this.random.pick(own)];
    return {
      serviceIds: chosen.map((service) => service.id),
      durationMin: chosen.reduce(
        (sum, service) => sum + service.durationMin,
        0,
      ),
      breakMin: Math.max(...chosen.map((service) => service.breakMin)),
      description: null,
    };
  }

  private service(category: CategoryKey, name: string): Service {
    const found = this.pricing[category].find(
      (service) => service.name === name,
    );
    if (!found) throw new Error(`No Usługa ${name} in ${category}`);
    return found;
  }

  /** The Klienci in turn, so each one gets a few Wizyty. */
  private client(): string {
    const id = this.clientIds[this.nextClient % this.clientIds.length];
    this.nextClient += 1;
    return id;
  }
}

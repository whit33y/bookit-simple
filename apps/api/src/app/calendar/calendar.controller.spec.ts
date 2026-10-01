import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  CALENDAR_DAY_INVALID,
  CALENDAR_RANGE_REVERSED,
  CALENDAR_RANGE_TOO_LONG,
  CalendarResponse,
} from '@bookit/shared';
import { hash } from 'argon2';
import request from 'supertest';
import { VisitState } from '../../generated/prisma/client';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';

const PASSWORD = 'correct horse battery staple';
const URL = '/api/calendar';

describe('Kalendarz', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  let app: INestApplication;
  let passwordHash: string;

  const unique = () => randomUUID().slice(0, 8);

  /**
   * The calendar shows the whole Salon, so each test gets its own, with a logged-in
   * Pracownik (Ola, first in the order) and a Klient.
   */
  async function newSalon() {
    const salon = await raw.salon.create({
      data: { name: `Studio ${unique()}`, slug: `kalendarz-${unique()}` },
    });
    const email = `calendar-${unique()}@bookit.test`;
    const user = await raw.user.create({ data: { email, passwordHash } });
    const me = await raw.staffMember.create({
      data: {
        salonId: salon.id,
        userId: user.id,
        role: 'EMPLOYEE',
        displayName: 'Ola',
      },
    });
    const client = await raw.client.create({
      data: {
        salonId: salon.id,
        name: 'Łucja',
        nameNormalized: 'lucja',
        phoneE164: '+48600100200',
      },
    });
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);

    const addPerson = (
      displayName: string,
      fields: {
        sortOrder?: number;
        acceptsVisits?: boolean;
        deletedAt?: Date;
      } = {},
    ) =>
      raw.staffMember.create({
        data: { salonId: salon.id, role: 'EMPLOYEE', displayName, ...fields },
      });

    const addVisit = (
      staffMemberId: string,
      startsAt: string,
      fields: {
        durationMin?: number;
        breakMin?: number;
        state?: VisitState;
      } = {},
    ) =>
      raw.visit.create({
        data: {
          salonId: salon.id,
          staffMemberId,
          clientId: client.id,
          startsAt: new Date(startsAt),
          durationMin: 60,
          description: 'Konsultacja',
          createdById: me.id,
          updatedById: me.id,
          ...fields,
        },
      });

    const calendar = async (from: string, to = from) => {
      const res = await agent.get(URL).query({ from, to }).expect(200);
      return res.body as CalendarResponse;
    };

    return { salon, me, client, agent, addPerson, addVisit, calendar };
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

  describe('staff', () => {
    it('lists the people who Przyjmują Wizyty in their order', async () => {
      const { me, addPerson, calendar } = await newSalon();
      const ewa = await addPerson('Ewa', { sortOrder: 2 });
      const anna = await addPerson('Anna', { sortOrder: 1 });
      await addPerson('Marta', { sortOrder: 3, acceptsVisits: false });

      const { staff } = await calendar('2026-10-05');

      expect(staff).toEqual([
        { id: me.id, displayName: 'Ola', visibleUntil: null },
        { id: anna.id, displayName: 'Anna', visibleUntil: null },
        { id: ewa.id, displayName: 'Ewa', visibleUntil: null },
      ]);
    });

    it('keeps an Usunięta osoba until the day of her last scheduled Wizyta', async () => {
      const { me, addPerson, addVisit, calendar } = await newSalon();
      const ewa = await addPerson('Ewa', { deletedAt: new Date() });
      await addVisit(ewa.id, '2026-10-08T12:00:00+02:00');
      await addVisit(ewa.id, '2026-10-10T18:00:00+02:00');
      // Neither a later Odwołana nor a later Nieodbyta one keeps the column.
      await addVisit(ewa.id, '2026-10-12T12:00:00+02:00', {
        state: 'CANCELLED',
      });
      await addVisit(ewa.id, '2026-10-13T12:00:00+02:00', { state: 'NO_SHOW' });

      const onTheDay = await calendar('2026-10-10');
      const before = await calendar('2026-10-05', '2026-10-11');
      const dayAfter = await calendar('2026-10-11');

      const ewaColumn = {
        id: ewa.id,
        displayName: 'Ewa',
        visibleUntil: '2026-10-10',
      };
      expect(onTheDay.staff).toEqual([expect.anything(), ewaColumn]);
      expect(before.staff).toEqual([expect.anything(), ewaColumn]);
      expect(dayAfter.staff.map((person) => person.id)).toEqual([me.id]);
    });

    it('leaves out an Usunięta osoba with no scheduled Wizyty left', async () => {
      const { me, addPerson, addVisit, calendar } = await newSalon();
      const ewa = await addPerson('Ewa', { deletedAt: new Date() });
      await addVisit(ewa.id, '2026-10-01T12:00:00+02:00');

      const { staff } = await calendar('2026-10-02', '2026-10-08');

      expect(staff.map((person) => person.id)).toEqual([me.id]);
    });
  });

  describe('visits', () => {
    it('returns Zaplanowane and Nieodbyte Wizyty with the Klient and Usługi, not Odwołane', async () => {
      const { salon, me, client, addVisit, calendar } = await newSalon();
      const category = await raw.serviceCategory.create({
        data: { salonId: salon.id, name: 'Strzyżenie' },
      });
      const service = await raw.service.create({
        data: {
          salonId: salon.id,
          categoryId: category.id,
          name: 'Strzyżenie damskie',
          priceGrosze: 8000,
          priceType: 'FROM',
          durationMin: 60,
        },
      });
      const scheduled = await raw.visit.create({
        data: {
          salonId: salon.id,
          staffMemberId: me.id,
          clientId: client.id,
          startsAt: new Date('2026-10-05T10:00:00+02:00'),
          durationMin: 60,
          breakMin: 15,
          createdById: me.id,
          updatedById: me.id,
          services: {
            create: {
              serviceId: service.id,
              nameSnapshot: 'Strzyżenie damskie',
              priceGroszeSnapshot: 8000,
              priceTypeSnapshot: 'FROM',
            },
          },
        },
      });
      const noShow = await addVisit(me.id, '2026-10-05T12:00:00+02:00', {
        state: 'NO_SHOW',
      });
      await addVisit(me.id, '2026-10-05T14:00:00+02:00', {
        state: 'CANCELLED',
      });

      const { visits } = await calendar('2026-10-05');

      expect(visits).toEqual([
        {
          id: scheduled.id,
          staffMemberId: me.id,
          clientId: client.id,
          client: { name: 'Łucja', phoneE164: '+48600100200' },
          startsAt: '2026-10-05T08:00:00.000Z',
          durationMin: 60,
          breakMin: 15,
          description: null,
          state: 'SCHEDULED',
          services: [
            {
              serviceId: service.id,
              name: 'Strzyżenie damskie',
              priceGrosze: 8000,
              priceType: 'FROM',
            },
          ],
          createdById: me.id,
          updatedById: me.id,
        },
        expect.objectContaining({ id: noShow.id, state: 'NO_SHOW' }),
      ]);
    });

    it('returns a Wizyta of the day before that goes past midnight', async () => {
      const { me, addVisit, calendar } = await newSalon();
      const late = await addVisit(me.id, '2026-10-04T23:30:00+02:00');
      // Ends with its Przerwa at midnight sharp: not on the 5th.
      await addVisit(me.id, '2026-10-04T23:00:00+02:00', {
        durationMin: 45,
        breakMin: 15,
      });
      // Starts at midnight after `to`.
      await addVisit(me.id, '2026-10-06T00:00:00+02:00');

      const { visits } = await calendar('2026-10-05');

      expect(visits.map((visit) => visit.id)).toEqual([late.id]);
    });

    it('counts the Przerwa as part of the Wizyta', async () => {
      const { me, addVisit, calendar } = await newSalon();
      const visit = await addVisit(me.id, '2026-10-04T23:00:00+02:00', {
        durationMin: 45,
        breakMin: 30,
      });

      const { visits } = await calendar('2026-10-05');

      expect(visits.map((item) => item.id)).toEqual([visit.id]);
    });

    it('shows the days of the range in Polish time', async () => {
      const { me, addVisit, calendar } = await newSalon();
      // 25 October 2026 has 25 hours: the clocks go back at 3:00.
      const first = await addVisit(me.id, '2026-10-25T00:00:00+02:00');
      const last = await addVisit(me.id, '2026-10-25T23:00:00+01:00');
      await addVisit(me.id, '2026-10-26T00:00:00+01:00');

      const { visits } = await calendar('2026-10-25');

      expect(visits.map((visit) => visit.id)).toEqual([first.id, last.id]);
    });

    it('leaves out Wizyty of another Salon', async () => {
      const mine = await newSalon();
      const other = await newSalon();
      await other.addVisit(other.me.id, '2026-10-05T10:00:00+02:00');

      const { visits, staff } = await mine.calendar('2026-10-05');

      expect(visits).toEqual([]);
      expect(staff.map((person) => person.id)).toEqual([mine.me.id]);
    });
  });

  it('returns the Nieobecności overlapping the range', async () => {
    const { salon, me, calendar } = await newSalon();
    const absence = (startsAt: string, endsAt: string) =>
      raw.absence.create({
        data: {
          salonId: salon.id,
          staffMemberId: me.id,
          startsAt: new Date(startsAt),
          endsAt: new Date(endsAt),
          reason: 'Urlop',
        },
      });
    const holiday = await absence(
      '2026-10-01T00:00:00+02:00',
      '2026-10-06T00:00:00+02:00',
    );
    await absence('2026-10-04T10:00:00+02:00', '2026-10-05T00:00:00+02:00');
    await absence('2026-10-06T00:00:00+02:00', '2026-10-07T00:00:00+02:00');

    const { absences } = await calendar('2026-10-05');

    expect(absences).toEqual([
      {
        id: holiday.id,
        staffMemberId: me.id,
        startsAt: '2026-09-30T22:00:00.000Z',
        endsAt: '2026-10-05T22:00:00.000Z',
        reason: 'Urlop',
      },
    ]);
  });

  it('returns the Święta of the range, across the new year', async () => {
    const { calendar } = await newSalon();

    const { holidays } = await calendar('2026-12-24', '2027-01-05');

    expect(holidays).toEqual([
      { date: '2026-12-24', name: 'Wigilia Bożego Narodzenia' },
      { date: '2026-12-25', name: 'Boże Narodzenie (pierwszy dzień)' },
      { date: '2026-12-26', name: 'Boże Narodzenie (drugi dzień)' },
      { date: '2027-01-01', name: 'Nowy Rok' },
    ]);
  });

  it('returns the Godziny otwarcia', async () => {
    const { salon, calendar } = await newSalon();
    await raw.openingHours.create({
      data: {
        salonId: salon.id,
        weekday: 1,
        opensAt: new Date('1970-01-01T09:00:00Z'),
        closesAt: new Date('1970-01-01T18:00:00Z'),
      },
    });

    const { openingHours } = await calendar('2026-10-05');

    expect(openingHours).toEqual([
      { weekday: 1, opensAt: '09:00', closesAt: '18:00' },
    ]);
  });

  describe('range', () => {
    it('takes 31 days', async () => {
      const { calendar } = await newSalon();
      await calendar('2026-10-01', '2026-10-31');
    });

    it('answers 422 for 32 days', async () => {
      const { agent } = await newSalon();

      const res = await agent
        .get(URL)
        .query({ from: '2026-10-01', to: '2026-11-01' })
        .expect(422);

      expect(res.body.message).toBe(CALENDAR_RANGE_TOO_LONG);
    });

    it('answers 422 for `to` before `from`', async () => {
      const { agent } = await newSalon();

      const res = await agent
        .get(URL)
        .query({ from: '2026-10-05', to: '2026-10-04' })
        .expect(422);

      expect(res.body.message).toBe(CALENDAR_RANGE_REVERSED);
    });

    it.each([
      {},
      { from: '2026-10-05' },
      { from: '2026-02-29', to: '2026-03-01' },
      { from: '5.10.2026', to: '2026-10-05' },
      { from: ['2026-10-05', '2026-10-06'], to: '2026-10-06' },
    ])('answers 400 for %j', async (query) => {
      const { agent } = await newSalon();

      const res = await agent.get(URL).query(query).expect(400);

      expect(res.body.message).toBe(CALENDAR_DAY_INVALID);
    });
  });
});

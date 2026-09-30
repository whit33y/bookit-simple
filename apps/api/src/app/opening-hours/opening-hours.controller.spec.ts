import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  OPENING_HOURS_CLOSES_BEFORE_OPENS,
  OPENING_HOURS_DUPLICATE_WEEKDAY,
  OPENING_HOURS_INVALID_TIME,
  OPENING_HOURS_INVALID_WEEKDAY,
  OpeningHoursDay,
} from '@bookit/shared';
import { hash } from 'argon2';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { createPrismaClient } from '../prisma/prisma.service';

const PASSWORD = 'correct horse battery staple';

const WEEK: OpeningHoursDay[] = [
  { weekday: 1, opensAt: '09:00', closesAt: '19:00' },
  { weekday: 2, opensAt: '09:00', closesAt: '19:00' },
  { weekday: 6, opensAt: '08:30', closesAt: '15:00' },
];

describe('Godziny otwarcia', () => {
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

  async function addStaffMember(salonId: string, role: 'OWNER' | 'EMPLOYEE') {
    const email = `opening-hours-${unique()}@bookit.test`;
    const user = await raw.user.create({ data: { email, passwordHash } });
    await raw.staffMember.create({
      data: { salonId, userId: user.id, role, displayName: role },
    });
    return logIn(email);
  }

  async function salonWithOwner() {
    const salon = await raw.salon.create({
      data: { name: `Studio ${unique()}`, slug: `test-${randomUUID()}` },
    });
    return { salon, asOwner: await addStaffMember(salon.id, 'OWNER') };
  }

  /** The stored `time` values as Postgres prints them, untouched by any `Date`. */
  function storedTimes(salonId: string) {
    return raw.$queryRaw<{ weekday: number; opens: string; closes: string }[]>`
      SELECT "weekday", "opensAt"::text AS opens, "closesAt"::text AS closes
      FROM "OpeningHours" WHERE "salonId" = ${salonId}::uuid ORDER BY "weekday"`;
  }

  /** Node reads `TZ` on every date operation, so the API runs in that zone meanwhile. */
  async function inTimeZone<T>(zone: string, run: () => Promise<T>) {
    const before = process.env.TZ;
    process.env.TZ = zone;
    try {
      return await run();
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
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

  describe('GET /api/opening-hours', () => {
    it('lists the open weekdays of the own Salon, Monday first', async () => {
      const { salon, asOwner } = await salonWithOwner();
      const other = await salonWithOwner();
      await other.asOwner.put('/api/opening-hours').send(WEEK).expect(200);
      const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
      await raw.openingHours.create({
        data: {
          salonId: salon.id,
          weekday: 6,
          opensAt: time('09:00'),
          closesAt: time('14:00'),
        },
      });
      await raw.openingHours.create({
        data: {
          salonId: salon.id,
          weekday: 1,
          opensAt: time('10:00'),
          closesAt: time('18:30'),
        },
      });

      const res = await asOwner.get('/api/opening-hours').expect(200);

      expect(res.body).toEqual([
        { weekday: 1, opensAt: '10:00', closesAt: '18:30' },
        { weekday: 6, opensAt: '09:00', closesAt: '14:00' },
      ] satisfies OpeningHoursDay[]);
    });

    it('is an empty list for a Salon without Godziny otwarcia', async () => {
      const { asOwner } = await salonWithOwner();

      await asOwner.get('/api/opening-hours').expect(200, []);
    });
  });

  describe('PUT /api/opening-hours', () => {
    it('replaces the whole week; a weekday left out is closed', async () => {
      const { salon, asOwner } = await salonWithOwner();
      await asOwner.put('/api/opening-hours').send(WEEK).expect(200);

      const res = await asOwner
        .put('/api/opening-hours')
        .send([
          { weekday: 5, opensAt: '10:00', closesAt: '20:00' },
          { weekday: 1, opensAt: '07:15', closesAt: '12:45' },
        ])
        .expect(200);

      const saved = [
        { weekday: 1, opensAt: '07:15', closesAt: '12:45' },
        { weekday: 5, opensAt: '10:00', closesAt: '20:00' },
      ];
      expect(res.body).toEqual(saved);
      await asOwner.get('/api/opening-hours').expect(200, saved);
      expect(
        await raw.openingHours.count({ where: { salonId: salon.id } }),
      ).toBe(2);
    });

    it('closes every day with an empty list', async () => {
      const { asOwner } = await salonWithOwner();
      await asOwner.put('/api/opening-hours').send(WEEK).expect(200);

      await asOwner.put('/api/opening-hours').send([]).expect(200, []);
      await asOwner.get('/api/opening-hours').expect(200, []);
    });

    it('does not touch the Godziny otwarcia of another Salon', async () => {
      const { asOwner } = await salonWithOwner();
      const other = await salonWithOwner();
      await other.asOwner.put('/api/opening-hours').send(WEEK).expect(200);

      await asOwner.put('/api/opening-hours').send([]).expect(200);

      await other.asOwner.get('/api/opening-hours').expect(200, WEEK);
    });

    it.each([
      ['closesAt before opensAt', '18:00', '09:00'],
      ['closesAt equal to opensAt', '09:00', '09:00'],
    ])(
      'answers 422 for %s and keeps the week',
      async (_, opensAt, closesAt) => {
        const { asOwner } = await salonWithOwner();
        await asOwner.put('/api/opening-hours').send(WEEK).expect(200);

        const res = await asOwner
          .put('/api/opening-hours')
          .send([
            { weekday: 1, opensAt: '09:00', closesAt: '17:00' },
            { weekday: 2, opensAt, closesAt },
          ])
          .expect(422);

        expect(res.body.message).toBe(OPENING_HOURS_CLOSES_BEFORE_OPENS);
        await asOwner.get('/api/opening-hours').expect(200, WEEK);
      },
    );

    it.each([
      ['no array', { weekday: 1 }, undefined],
      [
        'a weekday of 0',
        [{ weekday: 0, opensAt: '09:00', closesAt: '17:00' }],
        OPENING_HOURS_INVALID_WEEKDAY,
      ],
      [
        'a weekday of 8',
        [{ weekday: 8, opensAt: '09:00', closesAt: '17:00' }],
        OPENING_HOURS_INVALID_WEEKDAY,
      ],
      [
        'a weekday that is not a whole number',
        [{ weekday: 1.5, opensAt: '09:00', closesAt: '17:00' }],
        OPENING_HOURS_INVALID_WEEKDAY,
      ],
      [
        'a time with seconds',
        [{ weekday: 1, opensAt: '09:00:00', closesAt: '17:00' }],
        OPENING_HOURS_INVALID_TIME,
      ],
      [
        'an hour of 24',
        [{ weekday: 1, opensAt: '09:00', closesAt: '24:00' }],
        OPENING_HOURS_INVALID_TIME,
      ],
      [
        'a time without a leading zero',
        [{ weekday: 1, opensAt: '9:00', closesAt: '17:00' }],
        OPENING_HOURS_INVALID_TIME,
      ],
      [
        'a missing time',
        [{ weekday: 1, opensAt: '09:00' }],
        OPENING_HOURS_INVALID_TIME,
      ],
      [
        'two ranges on one day',
        [
          { weekday: 1, opensAt: '09:00', closesAt: '12:00' },
          { weekday: 1, opensAt: '13:00', closesAt: '17:00' },
        ],
        OPENING_HOURS_DUPLICATE_WEEKDAY,
      ],
    ])('answers 400 for %s', async (_, body, message) => {
      const { asOwner } = await salonWithOwner();

      const res = await asOwner
        .put('/api/opening-hours')
        .send(body)
        .expect(400);

      if (message) expect(res.body.message).toBe(message);
    });
  });

  describe('server time zone', () => {
    const ZONES = ['UTC', 'America/New_York'];

    it.each(ZONES)(
      'keeps the hours as written when saved with TZ=%s',
      async (zone) => {
        const { salon, asOwner } = await salonWithOwner();
        const week: OpeningHoursDay[] = [
          { weekday: 1, opensAt: '00:00', closesAt: '23:59' },
          { weekday: 3, opensAt: '09:00', closesAt: '19:00' },
          { weekday: 7, opensAt: '20:30', closesAt: '23:45' },
        ];

        const saved = await inTimeZone(zone, () =>
          asOwner.put('/api/opening-hours').send(week).expect(200),
        );

        expect(saved.body).toEqual(week);
        expect(await storedTimes(salon.id)).toEqual([
          { weekday: 1, opens: '00:00:00', closes: '23:59:00' },
          { weekday: 3, opens: '09:00:00', closes: '19:00:00' },
          { weekday: 7, opens: '20:30:00', closes: '23:45:00' },
        ]);
        for (const readZone of ZONES) {
          const read = await inTimeZone(readZone, () =>
            asOwner.get('/api/opening-hours').expect(200),
          );
          expect(read.body).toEqual(week);
        }
      },
    );
  });
});

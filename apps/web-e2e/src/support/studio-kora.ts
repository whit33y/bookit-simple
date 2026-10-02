import {
  addDays,
  CalendarDay,
  CalendarResponse,
  CalendarVisit,
  warsawDate,
} from '@bookit/shared';
import {
  APIRequestContext,
  expect,
  Page,
  test as base,
} from '@playwright/test';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PASSWORD } from './invited-owner';

const WORKSPACE_ROOT = join(__dirname, '../../../..');
const run = promisify(execFile);

export type StaffKey = 'magda' | 'kasia' | 'ola' | 'natalia';

/** A copy of Studio Kora from the seed, under its own address and e-mails. */
export interface StudioKora {
  /** Adres wizytówki */
  slug: string;
  emailDomain: string;
  /** Magda (Właściciel), Kasia, Ola and Natalia, all with `PASSWORD`. */
  emails: Record<StaffKey, string>;
}

/** Runs the seed of one copy, the same code as `nx run api:seed`. */
function seedCopy(kora: StudioKora, ...flags: string[]) {
  return run(
    join(WORKSPACE_ROOT, 'node_modules/.bin/tsx'),
    [
      '--tsconfig',
      'apps/api/tsconfig.app.json',
      'apps/api/src/seed/seed-studio-kora-copy.ts',
      '--slug',
      kora.slug,
      '--email-domain',
      kora.emailDomain,
      ...flags,
    ],
    {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env, SEED_PASSWORD: PASSWORD },
    },
  );
}

/**
 * A fresh Studio Kora per test, so every pilot scenario (#38) starts from the seed
 * whatever ran before it, and they run side by side. `studioKora()` seeds one more, e.g.
 * a second Salon; each is removed after the test.
 */
export const test = base.extend<{ studioKora: () => Promise<StudioKora> }>({
  // eslint-disable-next-line no-empty-pattern
  studioKora: async ({}, use) => {
    const seeded: StudioKora[] = [];
    await use(async () => {
      const tag = randomUUID().slice(0, 8);
      const emailDomain = `kora-${tag}.test`;
      const kora: StudioKora = {
        slug: `kora-${tag}`,
        emailDomain,
        emails: {
          magda: `magda@${emailDomain}`,
          kasia: `kasia@${emailDomain}`,
          ola: `ola@${emailDomain}`,
          natalia: `natalia@${emailDomain}`,
        },
      };
      seeded.push(kora);
      await seedCopy(kora);
      return kora;
    });
    for (const kora of seeded) await seedCopy(kora, '--remove');
  },
});

export { expect };

/** Logs in through `/logowanie`, as the Personel does every morning. */
export async function logIn(page: Page, email: string): Promise<void> {
  await page.goto('/logowanie');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Hasło', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page).toHaveURL('/panel/kalendarz');
}

/** Logs in on `request` alone, for a session that only calls the API. */
export async function logInRequest(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const response = await request.post('/api/auth/login', {
    data: { email, password: PASSWORD },
  });
  expect(response.ok()).toBe(true);
}

export async function calendar(
  request: APIRequestContext,
  from: CalendarDay,
  to: CalendarDay,
): Promise<CalendarResponse> {
  const reply = await request.get('/api/calendar', { params: { from, to } });
  expect(reply.ok()).toBe(true);
  return (await reply.json()) as CalendarResponse;
}

export const today = (): CalendarDay => warsawDate(new Date());

/** 1 = Monday ... 7 = Sunday. */
const weekdayOf = (day: CalendarDay) =>
  new Date(`${day}T12:00:00Z`).getUTCDay() || 7;

/**
 * The first day from tomorrow, Monday to Friday and not an Święto, on which `person` has
 * Wizyty. The seed fills this week and the next one, so there always is one; the
 * Salon closes at 19:00 those days, which leaves the evening free.
 */
export async function nextWorkingDay(
  request: APIRequestContext,
  person: string,
): Promise<{ day: CalendarDay; visits: CalendarVisit[] }> {
  const from = addDays(today(), 1);
  const shown = await calendar(request, from, addDays(from, 13));
  const id = shown.staff.find((p) => p.displayName === person)?.id;
  for (let i = 0; i < 14; i++) {
    const day = addDays(from, i);
    if (weekdayOf(day) > 5 || shown.holidays.some((h) => h.date === day)) {
      continue;
    }
    const visits = shown.visits
      .filter(
        (v) =>
          v.staffMemberId === id &&
          v.state === 'SCHEDULED' &&
          warsawDate(new Date(v.startsAt)) === day,
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    if (visits.length) return { day, visits };
  }
  throw new Error(`${person} has no Wizyty in the next two weeks`);
}

/** `9:05` on the Warsaw clock, as the grid writes it. */
export const clock = (instant: Date | string): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));

/** The accessible name of a Wizyta in the grid starts with `9:00–9:45, Klient`. */
export function visitName(visit: CalendarVisit): RegExp {
  const end = new Date(
    new Date(visit.startsAt).getTime() + visit.durationMin * 60_000,
  );
  return new RegExp(
    `^${clock(visit.startsAt)}–${clock(end)}, ${visit.client.name}`,
  );
}

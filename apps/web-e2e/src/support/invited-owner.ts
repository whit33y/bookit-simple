import 'dotenv/config';
import { APIRequestContext, request } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { linkSentTo } from './mailpit';

export const PASSWORD = 'haslo-do-testow-e2e';

/** The Administrator from `.env`, created by `nx run api:seed`. */
export const ADMINISTRATOR = {
  email: process.env['ADMIN_EMAIL'] ?? 'admin@bookit.local',
  password: process.env['ADMIN_PASSWORD'] ?? 'admin1234',
};

export interface InvitedOwner {
  email: string;
  salonName: string;
  /** Adres wizytówki */
  slug: string;
}

/** A unique Salon name, Właściciel e-mail and the address slugified from the name. */
export function newSalonData() {
  const id = randomUUID().slice(0, 8);
  return {
    salonName: `Studio E2E ${id}`,
    slug: `studio-e2e-${id}`,
    ownerName: 'Ewa',
    email: `wlasciciel-${id}@bookit.test`,
  };
}

/**
 * The Administrator logged in once per worker. Logins are throttled to 10 per 15 minutes
 * per e-mail, so logging in for every Salon would soon get `429`.
 */
let administrator: Promise<APIRequestContext> | undefined;

function administratorRequest(): Promise<APIRequestContext> {
  administrator ??= (async () => {
    const admin = await request.newContext({
      baseURL: 'http://localhost:4200',
    });
    const login = await admin.post('/api/auth/login', { data: ADMINISTRATOR });
    if (!login.ok()) {
      await admin.dispose();
      administrator = undefined;
      throw new Error(
        `Administrator login: ${login.status()}. Run \`npx nx run api:seed\`.`,
      );
    }
    return admin;
  })();
  return administrator;
}

/**
 * A new Salon with a Właściciel who got the invitation e-mail but has not set a password,
 * created through the Administrator's API, as the form does.
 */
export async function invitedOwner(): Promise<InvitedOwner> {
  const { salonName, slug, ownerName, email } = newSalonData();
  const admin = await administratorRequest();
  const created = await admin.post('/api/admin/salons', {
    data: { name: salonName, slug, ownerName, ownerEmail: email },
  });
  if (!created.ok()) {
    throw new Error(`POST /api/admin/salons: ${created.status()}`);
  }
  return { email, salonName, slug };
}

/** A Właściciel who has set `PASSWORD`, logged in on `request` (and so its page). */
export async function loggedInOwner(
  request: APIRequestContext,
): Promise<InvitedOwner> {
  const owner = await invitedOwner();
  const link = await linkSentTo(owner.email, 'zaproszenie');
  const token = link.split('/').at(-1);
  const response = await request.post('/api/auth/accept-invitation', {
    data: { token, password: PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(`accept-invitation: ${response.status()}`);
  }
  return owner;
}

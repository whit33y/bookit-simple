import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { Cookie, SessionData } from 'express-session';
import { ClsService } from 'nestjs-cls';
import {
  createIsolatedPrismaClient,
  createPrismaClient,
  PrismaService,
} from '../prisma/prisma.service';
import { PrismaSessionStore } from './prisma-session.store';

describe('PrismaSessionStore', () => {
  const url = process.env.DATABASE_URL ?? '';
  const raw = createPrismaClient(url);
  const prisma = createIsolatedPrismaClient(
    url,
    new ClsService(new AsyncLocalStorage()),
  ) as unknown as PrismaService;
  const store = new PrismaSessionStore(prisma);
  const get = promisify(store.get.bind(store));
  const set = promisify(store.set.bind(store));
  const touch = promisify(store.touch.bind(store));
  const destroy = promisify(store.destroy.bind(store));

  let userId: string;

  function sessionData(expires: Date): SessionData {
    const cookie = new Cookie();
    cookie.expires = expires;
    return { cookie, userId };
  }

  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);

  beforeAll(async () => {
    const user = await raw.user.create({
      data: { email: `store-${randomUUID()}@bookit.test` },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await raw.user.delete({ where: { id: userId } });
    await raw.$disconnect();
    await prisma.$disconnect();
  });

  it('saves the session with its userId and expiry in their own columns', async () => {
    const sid = randomUUID();
    const expires = inDays(30);

    await set(sid, sessionData(expires));

    const row = await raw.session.findUniqueOrThrow({ where: { sid } });
    expect(row.userId).toBe(userId);
    expect(row.expiresAt).toEqual(expires);
    expect(await get(sid)).toMatchObject({ userId });
  });

  it('does not return an expired session', async () => {
    const sid = randomUUID();
    await set(sid, sessionData(inDays(-1)));

    expect(await get(sid)).toBeNull();
  });

  it('touch moves the expiry forward', async () => {
    const sid = randomUUID();
    await set(sid, sessionData(inDays(1)));
    const later = inDays(30);

    await touch(sid, sessionData(later));

    const row = await raw.session.findUniqueOrThrow({ where: { sid } });
    expect(row.expiresAt).toEqual(later);
  });

  it('destroy removes the session', async () => {
    const sid = randomUUID();
    await set(sid, sessionData(inDays(1)));

    await destroy(sid);

    expect(await get(sid)).toBeNull();
    expect(await raw.session.count({ where: { sid } })).toBe(0);
  });
});

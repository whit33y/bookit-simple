import { Inject, Injectable } from '@nestjs/common';
import { SessionData, Store } from 'express-session';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    /** Absent for the Administrator. */
    staffMemberId?: string;
  }
}

/** Fallback for a session saved without a cookie expiry. Matches the cookie's `maxAge`. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Callback = (err?: unknown) => void;

/**
 * `express-session` store on the Prisma `Session` model (ADR 0005).
 * `userId` goes to its own column, so `SessionService` can drop every session of a person.
 */
@Injectable()
export class PrismaSessionStore extends Store {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  override get(
    sid: string,
    callback: (err: unknown, session?: SessionData | null) => void,
  ): void {
    this.prisma.session
      .findUnique({ where: { sid } })
      .then((row) => {
        const live = row && row.expiresAt > new Date();
        callback(null, live ? (row.data as unknown as SessionData) : null);
      })
      .catch(callback);
  }

  override set(sid: string, session: SessionData, callback?: Callback): void {
    const data = JSON.parse(JSON.stringify(session)) as Prisma.InputJsonValue;
    const fields = {
      data,
      userId: session.userId ?? null,
      expiresAt: expiresAt(session),
    };
    this.prisma.session
      .upsert({ where: { sid }, create: { sid, ...fields }, update: fields })
      .then(() => callback?.(), callback);
  }

  override destroy(sid: string, callback?: Callback): void {
    this.prisma.session
      .deleteMany({ where: { sid } })
      .then(() => callback?.(), callback);
  }

  /** `rolling` sessions: every request pushes the expiry 30 days ahead. */
  override touch(sid: string, session: SessionData, callback?: Callback): void {
    this.prisma.session
      .updateMany({ where: { sid }, data: { expiresAt: expiresAt(session) } })
      .then(() => callback?.(), callback);
  }
}

function expiresAt(session: SessionData): Date {
  const expires = session.cookie?.expires;
  return expires ? new Date(expires) : new Date(Date.now() + SESSION_TTL_MS);
}

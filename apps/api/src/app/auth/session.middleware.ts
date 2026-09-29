import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import session from 'express-session';
import { Env } from '../config/env';
import { PrismaSessionStore, SESSION_TTL_MS } from './prisma-session.store';

export const SESSION_COOKIE = 'bookit.sid';

/**
 * `express-session` with the Postgres store. The cookie lives 30 days and every
 * request renews it (`rolling`). `secure` is on whenever the app is served over HTTPS,
 * i.e. everywhere except the local environment.
 */
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  private readonly handler: RequestHandler;

  constructor(
    @Inject(ConfigService) config: ConfigService<Env, true>,
    @Inject(PrismaSessionStore) store: PrismaSessionStore,
  ) {
    const secure =
      new URL(config.get('APP_URL', { infer: true })).protocol === 'https:';
    this.handler = session({
      name: SESSION_COOKIE,
      secret: config.get('SESSION_SECRET', { infer: true }),
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      // Behind the hosting's TLS proxy the app itself sees plain HTTP.
      proxy: secure,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        maxAge: SESSION_TTL_MS,
      },
    });
  }

  use(req: Request, res: Response, next: NextFunction): void {
    this.handler(req, res, next);
  }
}

import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuthenticatedUser } from '../salon-context/salon-context.guard';
import { AuthService } from './auth.service';
import { destroySession } from './session-helpers';

/**
 * Turns the session into `req.user`, which `SalonContextGuard` copies into the Salon
 * context (#5). Checks the account and the Salon on every request: a session of a
 * removed person is dropped, a session of a suspended Salon gets `403` until the Salon
 * is active again. Login, logout and the invitation routes skip it (`AuthModule`), so
 * such a session can still be replaced or ended.
 */
@Injectable()
export class CurrentUserMiddleware implements NestMiddleware {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async use(
    req: Request & { user?: AuthenticatedUser },
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const userId = req.session?.userId;
    if (!userId) return next();

    const user = await this.auth.authenticate({
      userId,
      staffMemberId: req.session.staffMemberId,
    });
    if (!user) {
      await destroySession(req);
      return next();
    }
    req.user = user;
    next();
  }
}

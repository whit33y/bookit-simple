import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { normalizeEmail } from './auth.service';

/** 10 login attempts per 15 minutes per e-mail, whichever IP they come from. */
export const LOGIN_THROTTLE = { name: 'login', ttl: 15 * 60 * 1000, limit: 10 };

@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return normalizeEmail(typeof email === 'string' ? email : '');
  }
}

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MeResponse } from '@bookit/shared';
import { AuthService } from './auth.service';

type Role = NonNullable<MeResponse['role']>;

/**
 * Lets the person through when `allowed(me)`, otherwise redirects: without a session to
 * `/logowanie`, with one to their own panel. An unreachable API counts as no session,
 * so the login page can say what is wrong.
 */
function guardBy(allowed: (me: MeResponse) => boolean): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const me = await auth.ensureLoaded().catch(() => null);
    if (me && allowed(me)) return true;
    return router.parseUrl(me ? auth.homeUrl(me) : '/logowanie');
  };
}

export const authGuard: CanActivateFn = guardBy(() => true);

/** For the panel of a Salon: only these roles of the Personel. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return guardBy((me) => me.role !== null && roles.includes(me.role));
}

export const adminGuard: CanActivateFn = guardBy(
  (me) => me.user.isAdministrator,
);

/** For the login page: a logged-in person goes straight to their panel. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const me = await auth.ensureLoaded().catch(() => null);
  return me ? router.parseUrl(auth.homeUrl(me)) : true;
};


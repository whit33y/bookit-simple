import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { MeResponse } from '@bookit/shared';
import { adminGuard, authGuard, guestGuard, roleGuard } from './auth.guards';
import { AuthService } from './auth.service';
import { ADMINISTRATOR, OWNER } from './me.fixtures';

const EMPLOYEE: MeResponse = { ...OWNER, role: 'EMPLOYEE' };

describe('auth guards', () => {
  function run(guard: CanActivateFn, me: MeResponse | null | Error) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient()],
    });
    const auth = TestBed.inject(AuthService);
    vi.spyOn(auth, 'ensureLoaded').mockImplementation(() =>
      me instanceof Error ? Promise.reject(me) : Promise.resolve(me),
    );
    return TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
  }

  async function redirect(result: Promise<boolean | UrlTree>) {
    const value = await result;
    return value instanceof UrlTree
      ? TestBed.inject(Router).serializeUrl(value)
      : value;
  }

  describe('authGuard', () => {
    it('lets a logged-in person in', async () => {
      expect(await redirect(run(authGuard, OWNER))).toBe(true);
    });

    it('sends someone without a session to /logowanie', async () => {
      expect(await redirect(run(authGuard, null))).toBe('/logowanie');
    });

    it('sends to /logowanie when the API cannot be reached', async () => {
      expect(await redirect(run(authGuard, new Error('offline')))).toBe(
        '/logowanie',
      );
    });
  });

  describe('roleGuard', () => {
    it('lets in the listed roles', async () => {
      const guard = roleGuard('OWNER', 'EMPLOYEE');
      expect(await redirect(run(guard, OWNER))).toBe(true);
      expect(await redirect(run(guard, EMPLOYEE))).toBe(true);
    });

    it('sends a Pracownik away from what only the Właściciel may see', async () => {
      expect(await redirect(run(roleGuard('OWNER'), EMPLOYEE))).toBe('/panel');
    });

    it('sends the Administrator, who has no role in a Salon, to /admin', async () => {
      expect(await redirect(run(roleGuard('OWNER'), ADMINISTRATOR))).toBe(
        '/admin',
      );
    });

    it('sends someone without a session to /logowanie', async () => {
      expect(await redirect(run(roleGuard('OWNER'), null))).toBe('/logowanie');
    });
  });

  describe('adminGuard', () => {
    it('lets the Administrator in', async () => {
      expect(await redirect(run(adminGuard, ADMINISTRATOR))).toBe(true);
    });

    it('sends the Personel to /panel', async () => {
      expect(await redirect(run(adminGuard, OWNER))).toBe('/panel');
    });

    it('sends someone without a session to /logowanie', async () => {
      expect(await redirect(run(adminGuard, null))).toBe('/logowanie');
    });
  });

  describe('guestGuard', () => {
    it('shows the page to someone without a session', async () => {
      expect(await redirect(run(guestGuard, null))).toBe(true);
    });

    it('sends a logged-in person to their panel', async () => {
      expect(await redirect(run(guestGuard, ADMINISTRATOR))).toBe('/admin');
      expect(await redirect(run(guestGuard, EMPLOYEE))).toBe('/panel');
    });
  });
});

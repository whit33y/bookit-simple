import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { ADMINISTRATOR, OWNER } from './me.fixtures';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the logged-in person once and keeps it in me', async () => {
    const first = auth.ensureLoaded();
    const second = auth.ensureLoaded();
    http.expectOne('/api/auth/me').flush(OWNER);

    await expect(first).resolves.toEqual(OWNER);
    await expect(second).resolves.toEqual(OWNER);
    expect(auth.me()).toEqual(OWNER);
  });

  it('treats 401 from me as no session', async () => {
    const loaded = auth.ensureLoaded();
    http
      .expectOne('/api/auth/me')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    await expect(loaded).resolves.toBeNull();
    expect(auth.me()).toBeNull();
  });

  it('logs in and remembers who, without asking me again', async () => {
    const login = auth.login('anna@studiokora.pl', 'secret-pass');
    const req = http.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      email: 'anna@studiokora.pl',
      password: 'secret-pass',
    });
    req.flush(OWNER);

    await expect(login).resolves.toEqual(OWNER);
    await expect(auth.ensureLoaded()).resolves.toEqual(OWNER);
    http.expectNone('/api/auth/me');
  });

  it('logs out and forgets who', async () => {
    const login = auth.login('anna@studiokora.pl', 'secret-pass');
    http.expectOne('/api/auth/login').flush(OWNER);
    await login;

    const logout = auth.logout();
    const req = http.expectOne('/api/auth/logout');
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await logout;

    expect(auth.me()).toBeNull();
  });

  it('accepting an invitation logs the person in', async () => {
    const accept = auth.acceptInvitation('tok', 'long-enough-pass');
    const req = http.expectOne('/api/auth/accept-invitation');
    expect(req.request.body).toEqual({ token: 'tok', password: 'long-enough-pass' });
    req.flush(OWNER);

    await accept;
    expect(auth.me()).toEqual(OWNER);
  });

  it('sends the Administrator to /admin and the Personel to /panel', () => {
    expect(auth.homeUrl(ADMINISTRATOR)).toBe('/admin');
    expect(auth.homeUrl(OWNER)).toBe('/panel');
    expect(auth.homeUrl({ ...OWNER, role: 'EMPLOYEE' })).toBe('/panel');
  });
});

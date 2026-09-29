import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LoginPage } from './login-page';
import { ADMINISTRATOR, OWNER } from './me.fixtures';

describe('LoginPage', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const logIn = async () => {
      const [email, password] = Array.from(el.querySelectorAll('input'));
      email.value = ' anna@studiokora.pl ';
      email.dispatchEvent(new Event('input'));
      password.value = 'secret-pass';
      password.dispatchEvent(new Event('input'));
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      const req = http.expectOne('/api/auth/login');
      expect(req.request.body).toEqual({
        email: 'anna@studiokora.pl',
        password: 'secret-pass',
      });
      return req;
    };
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { el, navigate, logIn, settle };
  }

  it('sends the Personel to /panel', async () => {
    const { navigate, logIn, settle } = await setup();
    (await logIn()).flush(OWNER);
    await settle();
    expect(navigate).toHaveBeenCalledWith('/panel');
  });

  it('sends the Administrator to /admin', async () => {
    const { navigate, logIn, settle } = await setup();
    (await logIn()).flush(ADMINISTRATOR);
    await settle();
    expect(navigate).toHaveBeenCalledWith('/admin');
  });

  it('shows the error from the API in Polish', async () => {
    const { el, navigate, logIn, settle } = await setup();
    (await logIn()).flush(
      {
        statusCode: 401,
        message: 'Nieprawidłowy e-mail lub hasło',
        error: 'Unauthorized',
      },
      { status: 401, statusText: 'Unauthorized' },
    );
    await settle();
    expect(navigate).not.toHaveBeenCalled();
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      'Nieprawidłowy e-mail lub hasło',
    );
  });
});

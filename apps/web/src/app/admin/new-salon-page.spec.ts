import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { OWNER_EMAIL_TAKEN, SLUG_ERROR_MESSAGES } from '@bookit/shared';
import { NewSalonPage } from './new-salon-page';
import { SLUG_CHECK_DEBOUNCE_MS } from './slug-validators';

const SLUG_URL = '/api/admin/salons/slug-available';

describe('NewSalonPage', () => {
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
    const fixture = TestBed.createComponent(NewSalonPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const input = (name: string) =>
      el.querySelector<HTMLInputElement>(`input[formcontrolname="${name}"]`)!;
    const type = (name: string, value: string) => {
      input(name).value = value;
      input(name).dispatchEvent(new Event('input'));
    };
    const settle = async (ms = 0) => {
      await new Promise((r) => setTimeout(r, ms));
      fixture.detectChanges();
      await fixture.whenStable();
    };
    /** Waits out the debounce and answers the one check it sends. */
    const answerSlugCheck = async (slug: string, reason: string | null) => {
      await settle(SLUG_CHECK_DEBOUNCE_MS + 20);
      http
        .expectOne((req) => req.url === SLUG_URL)
        .flush({ available: reason === null, reason });
      expect(http.match(SLUG_URL)).toHaveLength(0);
      await settle();
      expect(input('slug').value).toBe(slug);
    };
    const text = () => el.textContent ?? '';
    return { el, http, navigate, input, type, settle, answerSlugCheck, text };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('suggests the Adres wizytówki from the name and checks it once typing stops', async () => {
    const { type, settle, answerSlugCheck, text } = await setup();

    type('name', 'Łódź');
    await settle(100);
    type('name', 'Łódź Nails & Spa');
    await answerSlugCheck('lodz-nails-spa', null);

    expect(text()).toContain('Adres wolny');
    expect(text()).toContain(`${location.origin}/lodz-nails-spa`);
  });

  it('shows a taken address without letting the form submit', async () => {
    const { el, http, type, answerSlugCheck, text } = await setup();

    type('name', 'Studio Kora');
    await answerSlugCheck('studio-kora', 'TAKEN');
    el.querySelector('form')?.dispatchEvent(new Event('submit'));

    expect(text()).toContain(SLUG_ERROR_MESSAGES.TAKEN);
    http.expectNone('/api/admin/salons');
  });

  it('rejects a reserved address without asking the API', async () => {
    const { http, type, settle, text } = await setup();

    type('name', 'Admin');
    await settle(SLUG_CHECK_DEBOUNCE_MS + 20);

    expect(text()).toContain(SLUG_ERROR_MESSAGES.RESERVED);
    http.expectNone((req) => req.url === SLUG_URL);
  });

  it('stops following the name once the address is typed by hand', async () => {
    const { input, type, answerSlugCheck } = await setup();

    type('slug', 'moj-salon');
    await answerSlugCheck('moj-salon', null);
    type('name', 'Studio Kora');

    expect(input('slug').value).toBe('moj-salon');
  });

  it('shows the phone the way the Wizytówka will', async () => {
    const { type, settle, el } = await setup();

    type('phone', '600123456');
    await settle();

    expect(el.textContent).toContain('+48 600 123 456');
  });

  async function fillAndSubmit(ctx: Awaited<ReturnType<typeof setup>>) {
    ctx.type('name', 'Studio Kora');
    await ctx.answerSlugCheck('studio-kora', null);
    ctx.type('ownerName', 'Anna Kora');
    ctx.type('ownerEmail', ' anna@studiokora.pl ');
    ctx.type('phone', '600 123 456');
    ctx.el.querySelector('form')?.dispatchEvent(new Event('submit'));
    return ctx.http.expectOne('/api/admin/salons');
  }

  it('creates the Salon and goes back to the Salons with a confirmation', async () => {
    const ctx = await setup();

    const req = await fillAndSubmit(ctx);
    expect(req.request.body).toEqual({
      name: 'Studio Kora',
      slug: 'studio-kora',
      ownerName: 'Anna Kora',
      ownerEmail: 'anna@studiokora.pl',
      phone: '600 123 456',
      email: null,
      street: null,
      postalCode: null,
      city: null,
    });
    req.flush(
      { id: 'salon-id', slug: 'studio-kora' },
      { status: 201, statusText: 'Created' },
    );
    await ctx.settle();

    expect(ctx.navigate).toHaveBeenCalledWith('/admin', {
      state: {
        created: { name: 'Studio Kora', ownerEmail: 'anna@studiokora.pl' },
      },
    });
  });

  it('waits for the address check when submitted right after typing', async () => {
    const ctx = await setup();
    ctx.type('ownerName', 'Anna Kora');
    ctx.type('ownerEmail', 'anna@studiokora.pl');
    ctx.type('name', 'Studio Kora');

    ctx.el.querySelector('form')?.dispatchEvent(new Event('submit'));
    ctx.http.expectNone('/api/admin/salons');
    await ctx.answerSlugCheck('studio-kora', null);

    ctx.http.expectOne('/api/admin/salons');
  });

  it('puts a 409 for the owner e-mail under that field', async () => {
    const ctx = await setup();

    (await fillAndSubmit(ctx)).flush(
      { message: OWNER_EMAIL_TAKEN, error: 'Conflict', statusCode: 409 },
      { status: 409, statusText: 'Conflict' },
    );
    await ctx.settle();

    expect(ctx.text()).toContain(OWNER_EMAIL_TAKEN);
    expect(ctx.navigate).not.toHaveBeenCalled();
  });
});

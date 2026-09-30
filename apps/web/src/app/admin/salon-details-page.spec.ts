import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import {
  AdminSalonDetails,
  INVITATION_ALREADY_ACCEPTED,
  SLUG_ERROR_MESSAGES,
} from '@bookit/shared';
import { of } from 'rxjs';
import { SalonDetailsPage } from './salon-details-page';
import { SLUG_CHECK_DEBOUNCE_MS } from './slug-validators';

const ID = '18f6bc6d-227a-43c4-8dbe-00f355d93e04';
const URL = `/api/admin/salons/${ID}`;

const SALON: AdminSalonDetails = {
  id: ID,
  name: 'Studio Kora',
  slug: 'studio-kora',
  status: 'ACTIVE',
  createdAt: '2026-09-29T10:00:00.000Z',
  owner: {
    displayName: 'Anna Kora',
    email: 'anna@studiokora.pl',
    invitationAccepted: false,
  },
  phone: '+48600123456',
  email: null,
  street: 'ul. Piotrkowska 120',
  postalCode: '90-006',
  city: 'Łódź',
};

describe('SalonDetailsPage', () => {
  async function setup(salon: AdminSalonDetails = SALON, confirm = true) {
    const open = vi.fn(() => ({ afterClosed: () => of(confirm) }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SalonDetailsPage);
    fixture.componentRef.setInput('id', ID);
    fixture.detectChanges();
    http.expectOne(URL).flush(salon);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const click = async (label: string) => {
      const button = [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes(label),
      );
      if (!button) throw new Error(`No button "${label}"`);
      button.click();
      await settle();
    };
    const text = () => el.textContent ?? '';
    const type = async (value: string) => {
      const input = el.querySelector<HTMLInputElement>('input[name="slug"]');
      if (!input) throw new Error('No address field');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const button = (label: string) =>
      [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes(label),
      );
    return { http, open, click, settle, text, type, button };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('shows the Salon, its Właściciel and contact details', async () => {
    const { text } = await setup();

    expect(text()).toContain('Studio Kora');
    expect(text()).toContain(`${location.origin}/studio-kora`);
    expect(text()).toContain('anna@studiokora.pl');
    expect(text()).toContain('+48 600 123 456');
    expect(text()).toContain('ul. Piotrkowska 120, 90-006 Łódź');
    expect(text()).toContain('29.09.2026');
  });

  it('suspends only after confirming in the dialog', async () => {
    const { http, open, click, settle, text } = await setup();

    await click('Zawieś Salon');

    expect(open).toHaveBeenCalledOnce();
    http
      .expectOne({ url: `${URL}/suspend`, method: 'POST' })
      .flush({ ...SALON, status: 'SUSPENDED' });
    await settle();
    expect(text()).toContain('Zawieszony');
    expect(text()).toContain('Personel został wylogowany');
    expect(text()).toContain('Odwieś Salon');
  });

  it('does not suspend when the dialog is cancelled', async () => {
    const { http, click } = await setup(SALON, false);

    await click('Zawieś Salon');

    http.expectNone(`${URL}/suspend`);
  });

  it('resumes a suspended Salon without asking', async () => {
    const { http, open, click, settle, text } = await setup({
      ...SALON,
      status: 'SUSPENDED',
    });

    await click('Odwieś Salon');

    expect(open).not.toHaveBeenCalled();
    http.expectOne(`${URL}/resume`).flush(SALON);
    await settle();
    expect(text()).toContain('Aktywny');
  });

  it('resends the invitation and shows the error from the API', async () => {
    const { http, click, settle, text } = await setup();

    await click('Wyślij zaproszenie ponownie');
    http.expectOne(`${URL}/resend-invitation`).flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    await settle();
    expect(text()).toContain('Nowe zaproszenie poszło na anna@studiokora.pl');

    await click('Wyślij zaproszenie ponownie');
    http
      .expectOne(`${URL}/resend-invitation`)
      .flush(
        { message: INVITATION_ALREADY_ACCEPTED, error: 'Conflict' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();
    expect(text()).toContain(INVITATION_ALREADY_ACCEPTED);
  });

  it('hides resending once the invitation is accepted', async () => {
    const { text } = await setup({
      ...SALON,
      owner: { ...SALON.owner!, invitationAccepted: true },
    });

    expect(text()).not.toContain('Wyślij zaproszenie ponownie');
  });

  describe('changing the Adres wizytówki', () => {
    const check = `/api/admin/salons/slug-available`;
    const wait = () =>
      new Promise((r) => setTimeout(r, SLUG_CHECK_DEBOUNCE_MS + 20));

    it('starts with the current address, no warning and nothing to save', async () => {
      const { http, button, text } = await setup();

      expect(button('Zmień adres')?.disabled).toBe(true);
      expect(text()).not.toContain('będą przekierowywane');
      http.expectNone((req) => req.url === check);
    });

    it('warns that old links redirect, checks the address for this Salon and saves it', async () => {
      const { http, type, click, settle, button, text } = await setup();

      await type('kora-studio');
      expect(text()).toContain(
        `Linki do ${location.origin}/studio-kora będą przekierowywane na nowy adres`,
      );
      await wait();
      const req = http.expectOne((r) => r.url === check);
      expect(req.request.params.get('slug')).toBe('kora-studio');
      expect(req.request.params.get('salonId')).toBe(ID);
      req.flush({ available: true, reason: null });
      await settle();

      expect(button('Zmień adres')?.disabled).toBe(false);
      await click('Zmień adres');
      const save = http.expectOne({ url: URL, method: 'PATCH' });
      expect(save.request.body).toEqual({ slug: 'kora-studio' });
      save.flush({ ...SALON, slug: 'kora-studio' });
      await settle();

      expect(text()).toContain(`${location.origin}/kora-studio`);
      expect(text()).toContain('Stary adres przekierowuje na nowy');
      expect(text()).not.toContain('będą przekierowywane');
    });

    it('shows why an address cannot be used, without asking the API about its form', async () => {
      const { http, type, button, text } = await setup();

      await type('admin');
      await wait();

      http.expectNone((r) => r.url === check);
      expect(text()).toContain(SLUG_ERROR_MESSAGES.RESERVED);
      expect(button('Zmień adres')?.disabled).toBe(true);
    });

    it('marks the field when another Salon took the address meanwhile', async () => {
      const { http, type, click, settle, text } = await setup();

      await type('kora-studio');
      await wait();
      http
        .expectOne((r) => r.url === check)
        .flush({ available: true, reason: null });
      await settle();
      await click('Zmień adres');
      http
        .expectOne({ url: URL, method: 'PATCH' })
        .flush(
          { message: SLUG_ERROR_MESSAGES.TAKEN, error: 'Conflict' },
          { status: 409, statusText: 'Conflict' },
        );
      await settle();

      expect(text()).toContain(SLUG_ERROR_MESSAGES.TAKEN);
    });
  });
});

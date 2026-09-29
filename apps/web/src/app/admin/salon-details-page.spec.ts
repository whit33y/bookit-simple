import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { AdminSalonDetails, INVITATION_ALREADY_ACCEPTED } from '@bookit/shared';
import { of } from 'rxjs';
import { SalonDetailsPage } from './salon-details-page';

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
    return { http, open, click, settle, text };
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
});

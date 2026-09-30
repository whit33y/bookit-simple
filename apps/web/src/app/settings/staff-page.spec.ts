import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { STAFF_EMAIL_TAKEN, StaffMemberView } from '@bookit/shared';
import { of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { OWNER } from '../auth/me.fixtures';
import { StaffPage } from './staff-page';

const ANNA: StaffMemberView = {
  id: 's1',
  displayName: 'Anna',
  email: 'anna@studiokora.pl',
  role: 'OWNER',
  invitation: 'ACCEPTED',
  acceptsVisits: true,
  showOnPage: true,
  photoId: null,
  bio: null,
};
const OLA: StaffMemberView = {
  ...ANNA,
  id: 's2',
  displayName: 'Ola',
  email: 'ola@studiokora.pl',
  role: 'EMPLOYEE',
  invitation: 'EXPIRED',
  showOnPage: false,
};

describe('StaffPage', () => {
  async function setup(
    staff: StaffMemberView[] = [ANNA, OLA],
    saved?: StaffMemberView | boolean,
  ) {
    const open = vi.fn(() => ({ afterClosed: () => of(saved) }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const auth = TestBed.inject(AuthService);
    vi.spyOn(auth, 'me').mockReturnValue(OWNER);
    const fixture = TestBed.createComponent(StaffPage);
    fixture.detectChanges();
    http.expectOne('/api/staff').flush(staff);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const page = fixture.componentInstance as unknown as {
      drop(event: Partial<CdkDragDrop<unknown>>): Promise<void>;
    };
    const button = (label: string) => {
      const found = el.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      );
      if (!found) throw new Error(`No button "${label}"`);
      return found;
    };
    const type = (label: string, value: string) => {
      const field = [...el.querySelectorAll('mat-form-field')].find((f) =>
        f.querySelector('mat-label')?.textContent?.includes(label),
      );
      const input = field?.querySelector('input');
      if (!input) throw new Error(`No field "${label}"`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const submit = async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    const names = () =>
      [...el.querySelectorAll('.row .name')].map((n) => n.textContent?.trim());
    const text = () => el.textContent ?? '';
    return { http, open, el, page, settle, button, type, submit, names, text };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('lists the Personel with the role and the invitation status', async () => {
    const { names, text } = await setup();

    expect(names()).toEqual(['Anna', 'Ola']);
    expect(text()).toContain('ola@studiokora.pl');
    expect(text()).toContain('Właściciel');
    expect(text()).toContain('Pracownik');
    expect(text()).toContain('Przyjęte');
    expect(text()).toContain('Wygasło');
  });

  it('offers to resend the invitation only to someone who has not accepted it', async () => {
    const { http, button, settle, text, el } = await setup();

    expect(
      el.querySelector('[aria-label="Wyślij zaproszenie ponownie: Anna"]'),
    ).toBeNull();
    button('Wyślij zaproszenie ponownie: Ola').click();
    http
      .expectOne({ url: '/api/staff/s2/resend-invitation', method: 'POST' })
      .flush(null);
    await settle();

    expect(text()).toContain('Nowe zaproszenie poszło na ola@studiokora.pl');
    expect(text()).toContain('Oczekuje');
  });

  it('invites a person, adds them to the list and clears the form', async () => {
    const { http, type, submit, settle, names, text, el } = await setup();

    type('Imię', ' Kasia ');
    type('E-mail', 'kasia@studiokora.pl');
    await submit();

    const req = http.expectOne({ url: '/api/staff/invite', method: 'POST' });
    expect(req.request.body).toEqual({
      displayName: 'Kasia',
      email: 'kasia@studiokora.pl',
      role: 'EMPLOYEE',
    });
    req.flush({
      ...OLA,
      id: 's3',
      displayName: 'Kasia',
      email: 'kasia@studiokora.pl',
      invitation: 'PENDING',
    });
    await settle();

    expect(names()).toEqual(['Anna', 'Ola', 'Kasia']);
    expect(text()).toContain('Zaproszenie poszło na kasia@studiokora.pl');
    expect(el.querySelector('input')?.value).toBe('');
  });

  it('shows a taken e-mail under its field', async () => {
    const { http, type, submit, settle, text } = await setup();

    type('Imię', 'Ola');
    type('E-mail', 'ola@studiokora.pl');
    await submit();
    http
      .expectOne('/api/staff/invite')
      .flush(
        { message: STAFF_EMAIL_TAKEN, error: 'Conflict' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();

    expect(text()).toContain(STAFF_EMAIL_TAKEN);
  });

  it('saves the order after a drop and puts it back when saving fails', async () => {
    const { http, page, settle, names, text } = await setup();

    const dropped = page.drop({ previousIndex: 1, currentIndex: 0 });
    await settle();
    expect(names()).toEqual(['Ola', 'Anna']);
    const req = http.expectOne({ url: '/api/staff/order', method: 'PUT' });
    expect(req.request.body).toEqual({ ids: ['s2', 's1'] });
    req.flush(null);
    await dropped;

    const failed = page.drop({ previousIndex: 1, currentIndex: 0 });
    http
      .expectOne('/api/staff/order')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await failed;
    await settle();

    expect(names()).toEqual(['Ola', 'Anna']);
    expect(text()).toContain('Wystąpił błąd serwera');
  });

  it('shows the person saved in the edit dialog', async () => {
    const { button, open, settle, names } = await setup(undefined, {
      ...OLA,
      displayName: 'Ola K.',
    });

    button('Edytuj: Ola').click();
    await settle();

    expect(open).toHaveBeenCalledOnce();
    expect(names()).toEqual(['Anna', 'Ola K.']);
  });

  it('takes a Właściciel who gave up the role to the calendar', async () => {
    const { http, button, settle } = await setup(undefined, {
      ...ANNA,
      role: 'EMPLOYEE',
    });
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);

    button('Edytuj: Anna').click();
    await settle();
    http.expectOne('/api/auth/me').flush({ ...OWNER, role: 'EMPLOYEE' });
    await settle();

    expect(navigate).toHaveBeenCalledWith('/panel');
  });

  it('offers to remove everyone but the Właściciel themselves', async () => {
    const { el } = await setup();

    expect(
      el.querySelector('button[aria-label="Usuń z Personelu: Ola"]'),
    ).not.toBeNull();
    expect(
      el.querySelector('button[aria-label="Usuń z Personelu: Anna"]'),
    ).toBeNull();
  });

  it('drops the person from the list once the delete dialog removed her', async () => {
    const { button, open, settle, names, text } = await setup(undefined, true);

    button('Usuń z Personelu: Ola').click();
    await settle();

    expect(open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: OLA }),
    );
    expect(names()).toEqual(['Anna']);
    expect(text()).toContain('Ola nie jest już w Personelu.');
  });

  it('keeps the person when the delete dialog was cancelled', async () => {
    const { button, settle, names } = await setup(undefined, false);

    button('Usuń z Personelu: Ola').click();
    await settle();

    expect(names()).toEqual(['Anna', 'Ola']);
  });
});

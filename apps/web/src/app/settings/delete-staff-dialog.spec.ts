import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { StaffDeletionPreview, StaffMemberView } from '@bookit/shared';
import { DeleteStaffDialog } from './delete-staff-dialog';

const OLA: StaffMemberView = {
  id: 's2',
  displayName: 'Ola',
  email: 'ola@studiokora.pl',
  role: 'EMPLOYEE',
  invitation: 'ACCEPTED',
  acceptsVisits: true,
  showOnPage: true,
  photoId: null,
  bio: null,
};

describe('DeleteStaffDialog', () => {
  async function setup(preview: StaffDeletionPreview) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: OLA },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(DeleteStaffDialog);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    http.expectOne('/api/staff/s2/deletion-preview').flush(preview);
    await settle();
    const button = (label: string) => {
      const found = [...el.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === label,
      );
      if (!found) throw new Error(`No button "${label}"`);
      return found;
    };
    const labels = () =>
      [...el.querySelectorAll('button')].map((b) => b.textContent?.trim());
    const text = () => el.textContent?.replace(/\s+/g, ' ') ?? '';
    return { http, close, settle, button, labels, text };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('shows her past and future Wizyty and the day of the last scheduled one', async () => {
    const { text, labels } = await setup({
      pastVisits: 12,
      futureVisits: 3,
      lastScheduledVisitAt: '2026-11-04T23:30:00.000Z',
    });

    expect(text()).toContain('Usunąć z Personelu: Ola?');
    expect(text()).toContain('Przeszłe Wizyty: 12');
    expect(text()).toContain('Przyszłe Wizyty: 3');
    // The day in Europe/Warsaw, not UTC.
    expect(text()).toContain('5.11.2026');
    expect(labels()).toEqual(['Anuluj', 'Usuń Wizyty', 'Zachowaj Wizyty']);
  });

  it.each([
    ['Zachowaj Wizyty', 'true'],
    ['Usuń Wizyty', 'false'],
  ])(
    '"%s" deletes with keepVisits=%s and closes with true',
    async (label, keep) => {
      const { http, close, settle, button } = await setup({
        pastVisits: 1,
        futureVisits: 0,
        lastScheduledVisitAt: null,
      });

      button(label).click();
      await settle();
      const req = http.expectOne(
        (r) => r.method === 'DELETE' && r.url === '/api/staff/s2',
      );
      expect(req.request.params.get('keepVisits')).toBe(keep);
      req.flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(close).toHaveBeenCalledWith(true);
    },
  );

  it('asks nothing about Wizyty when she has none', async () => {
    const { http, settle, button, labels, text } = await setup({
      pastVisits: 0,
      futureVisits: 0,
      lastScheduledVisitAt: null,
    });

    expect(text()).toContain('Ola nie ma żadnych Wizyt');
    expect(labels()).toEqual(['Anuluj', 'Usuń']);
    button('Usuń').click();
    await settle();
    http
      .expectOne((r) => r.params.get('keepVisits') === 'true')
      .flush(null, { status: 204, statusText: 'No Content' });
  });

  it('stays open with the message when deleting fails', async () => {
    const { http, close, settle, button, text } = await setup({
      pastVisits: 1,
      futureVisits: 1,
      lastScheduledVisitAt: '2026-11-04T10:00:00.000Z',
    });

    button('Zachowaj Wizyty').click();
    await settle();
    http
      .expectOne((r) => r.method === 'DELETE')
      .flush(
        {
          message: 'Salon musi mieć co najmniej jednego Właściciela',
          error: 'Unprocessable Entity',
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await settle();

    expect(close).not.toHaveBeenCalled();
    expect(text()).toContain('Salon musi mieć co najmniej jednego Właściciela');
  });
});

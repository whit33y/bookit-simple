import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  CalendarStaffMember,
  CalendarVisit,
  ServiceCategoryView,
  ServiceView,
  VISIT_COLLISION,
  VISIT_DESCRIPTION_REQUIRED,
  VisitCollisionResponse,
} from '@bookit/shared';
import { VisitDialog, VisitDialogData } from './visit-dialog';
import { VisitFields } from './visit-request';

const STAFF: CalendarStaffMember[] = [
  { id: 'kasia', displayName: 'Kasia', visibleUntil: null },
  { id: 'ola', displayName: 'Ola', visibleUntil: null },
  { id: 'ewa', displayName: 'Ewa', visibleUntil: '2026-11-30' },
];

const service = (
  id: string,
  name: string,
  durationMin: number,
  breakMin = 0,
): ServiceView => ({
  id,
  categoryId: 'cat',
  name,
  description: null,
  priceGrosze: 8000,
  priceType: 'FIXED',
  durationMin,
  breakMin,
  hidden: false,
  archived: false,
});

const SERVICES = [
  service('s1', 'Strzyżenie', 30, 5),
  service('s2', 'Koloryzacja', 45, 15),
  service('s3', 'Modelowanie', 20),
];
const CATEGORIES = [{ id: 'cat', name: 'Fryzjer' }] as ServiceCategoryView[];

const VISIT: CalendarVisit = {
  id: 'v1',
  staffMemberId: 'kasia',
  clientId: 'c1',
  // 10:00 in Warsaw.
  startsAt: '2026-11-12T09:00:00.000Z',
  durationMin: 45,
  breakMin: 15,
  description: null,
  state: 'SCHEDULED',
  services: [
    {
      serviceId: 's2',
      name: 'Koloryzacja',
      priceGrosze: 8000,
      priceType: 'FIXED',
    },
  ],
  createdById: 'kasia',
  updatedById: 'kasia',
  client: { name: 'Anna Nowak', phoneE164: null },
};

/** The parts of the dialog the tests reach into, past the autocomplete overlays. */
interface Internals {
  model: WritableSignal<Omit<VisitFields, 'serviceIds'>>;
  addService(
    event: { option: { value: ServiceView } },
    input: HTMLInputElement,
  ): void;
}

describe('VisitDialog', () => {
  async function setup(data: Partial<VisitDialogData> = {}) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: { staff: STAFF, ...data } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(VisitDialog);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    // `whenStable` waits for open requests, so the first ones are answered before.
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/services').flush(SERVICES);
    http.expectOne('/api/service-categories').flush(CATEGORIES);
    for (const search of http.match((r) => r.url === '/api/clients')) {
      search.flush([]);
    }
    await settle();

    const dialog = fixture.componentInstance as unknown as Internals;
    const pick = async (id: string) => {
      const input = document.createElement('input');
      dialog.addService(
        { option: { value: SERVICES.find((s) => s.id === id) as ServiceView } },
        input,
      );
      await settle();
    };
    const field = (label: string) => {
      const found = [...el.querySelectorAll('mat-form-field')].find((f) =>
        f.querySelector('mat-label')?.textContent?.includes(label),
      );
      const input = found?.querySelector('input, textarea');
      if (!input) throw new Error(`No field "${label}"`);
      return input as HTMLInputElement;
    };
    const type = async (label: string, value: string) => {
      const input = field(label);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const button = (text: string) => {
      const found = [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.trim().endsWith(text),
      );
      if (!found) throw new Error(`No button "${text}"`);
      return found;
    };
    const submit = async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    const fill = (fields: Partial<VisitFields>) =>
      dialog.model.update((m) => ({ ...m, ...fields }));
    const text = () => el.textContent ?? '';
    return {
      http,
      close,
      el,
      settle,
      pick,
      field,
      type,
      button,
      submit,
      fill,
      text,
    };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('starts at the field clicked and offers only who Przyjmuje Wizyty', async () => {
    const { field, el } = await setup({
      staffMemberId: 'ola',
      startsAt: new Date('2026-11-12T13:15:00Z'),
    });
    expect(field('Data').value).toBe('2026-11-12');
    expect(field('Godzina').value).toBe('14:15');
    expect(el.querySelector('mat-select')?.textContent).toContain('Ola');
    expect(el.textContent).not.toContain('(usunięta)');
  });

  it('suggests the Czas trwania until it is typed, and "przelicz z Usług" brings it back', async () => {
    const { pick, field, type, button, text } = await setup();
    await pick('s1');
    await pick('s2');
    expect(field('Czas trwania').value).toBe('75');
    expect(field('Przerwa').value).toBe('15');
    expect(text()).not.toContain('Przelicz z Usług');

    await type('Czas trwania', '90');
    await pick('s3');
    expect(field('Czas trwania').value).toBe('90');

    button('Przelicz z Usług').click();
    await new Promise((r) => setTimeout(r));
    expect(field('Czas trwania').value).toBe('95');
  });

  it('a quick length stops the suggestion too', async () => {
    const { pick, field, button } = await setup();
    await pick('s1');
    button('60 min').click();
    await pick('s2');
    expect(field('Czas trwania').value).toBe('60');
    expect(button('60 min').getAttribute('aria-pressed')).toBe('true');
  });

  it('asks for a description without Usługi', async () => {
    const { fill, submit, text } = await setup({ staffMemberId: 'kasia' });
    fill({ clientId: 'c1', day: '2026-11-12', time: '10:00' });
    await submit();
    expect(text()).toContain(VISIT_DESCRIPTION_REQUIRED);
  });

  it('shows the Kolizje of a 409 and saves despite them', async () => {
    const { http, close, fill, pick, submit, button, text, settle } =
      await setup({ staffMemberId: 'kasia' });
    fill({ clientId: 'c1', day: '2026-11-12', time: '10:30' });
    await pick('s1');
    await submit();

    const conflict: VisitCollisionResponse = {
      statusCode: 409,
      error: 'Conflict',
      message: VISIT_COLLISION,
      collisions: [
        {
          type: 'visit',
          id: 'v9',
          startsAt: '2026-11-12T09:00:00.000Z',
          endsAt: '2026-11-12T10:00:00.000Z',
          label: 'Basia',
        },
      ],
    };
    const first = http.expectOne({ url: '/api/visits', method: 'POST' });
    expect(first.request.body).toEqual({
      staffMemberId: 'kasia',
      clientId: 'c1',
      startsAt: '2026-11-12T09:30:00.000Z',
      durationMin: 30,
      breakMin: 5,
      serviceIds: ['s1'],
      description: null,
    });
    first.flush(conflict, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(text()).toContain(VISIT_COLLISION);
    expect(text()).toContain('12.11.2026, 10:00–11:00 Basia');

    button('Zapisz mimo to').click();
    await settle();
    const second = http.expectOne({ url: '/api/visits', method: 'POST' });
    expect(second.request.body.acceptCollisions).toBe(true);
    second.flush({ id: 'v2' });
    await settle();
    expect(close).toHaveBeenCalledWith({ id: 'v2' });
  });

  it('forgets the Kolizje once the time changes', async () => {
    const { http, fill, pick, submit, text, settle } = await setup({
      staffMemberId: 'kasia',
    });
    fill({ clientId: 'c1', day: '2026-11-12', time: '10:30' });
    await pick('s1');
    await submit();
    http.expectOne({ url: '/api/visits', method: 'POST' }).flush(
      {
        statusCode: 409,
        error: 'Conflict',
        message: VISIT_COLLISION,
        collisions: [],
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(text()).toContain('Zapisz mimo to');

    fill({ time: '12:00' });
    await settle();
    expect(text()).not.toContain('Zapisz mimo to');
  });

  it('edits a Wizyta with only what changed, keeping the saved Czas trwania', async () => {
    const { http, close, field, pick, fill, submit, settle } = await setup({
      visit: VISIT,
    });
    expect(field('Klient').value).toBe('Anna Nowak');
    expect(field('Czas trwania').value).toBe('45');
    await pick('s1');
    expect(field('Czas trwania').value).toBe('45');

    fill({ staffMemberId: 'ola' });
    await submit();
    const req = http.expectOne({ url: '/api/visits/v1', method: 'PATCH' });
    expect(req.request.body).toEqual({
      staffMemberId: 'ola',
      serviceIds: ['s2', 's1'],
    });
    req.flush({ ...VISIT, staffMemberId: 'ola' });
    await settle();
    expect(close).toHaveBeenCalled();
  });

  it('offers an Usunięta osoba only as the person of her own Wizyta', async () => {
    const { el } = await setup({ visit: { ...VISIT, staffMemberId: 'ewa' } });
    expect(el.querySelector('mat-select')?.textContent).toContain(
      'Ewa (usunięta)',
    );
  });
});

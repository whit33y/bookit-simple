import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import {
  ClientView,
  ClientVisit,
  ClientVisitPage,
  MeResponse,
} from '@bookit/shared';
import { of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { OWNER } from '../auth/me.fixtures';
import { ClientCardPage } from './client-card-page';
import { DeleteClientDialog } from './delete-client-dialog';

const ID = '5b0c8a64-7d1e-4f0a-9a43-2f1b9a1c0e11';
const URL = `/api/clients/${ID}`;

const ANNA: ClientView = {
  id: ID,
  name: 'Anna Nowak',
  phoneE164: '+48600100200',
  notes: 'Woli rano',
};

const visit = (fields: Partial<ClientVisit>): ClientVisit => ({
  id: 'v',
  staffMemberId: 'ewa',
  clientId: ID,
  startsAt: '2020-03-02T09:00:00.000Z',
  durationMin: 60,
  breakMin: 0,
  description: null,
  state: 'SCHEDULED',
  services: [],
  createdById: 'ewa',
  updatedById: 'ewa',
  staffMember: { displayName: 'Ewa', deleted: false },
  ...fields,
});

const VISITS = [
  visit({
    id: 'future',
    startsAt: '2099-01-05T13:00:00.000Z',
    services: [
      {
        serviceId: 's1',
        name: 'Strzyżenie damskie',
        priceGrosze: 12000,
        priceType: 'FROM',
      },
      {
        serviceId: 's2',
        name: 'Modelowanie',
        priceGrosze: 5000,
        priceType: 'FIXED',
      },
    ],
  }),
  visit({
    id: 'cancelled2',
    startsAt: '2020-05-04T10:00:00.000Z',
    state: 'CANCELLED',
    description: 'Koloryzacja',
  }),
  visit({
    id: 'done',
    startsAt: '2020-04-01T08:30:00.000Z',
    description: 'Grzywka',
    staffMember: { displayName: 'Kasia', deleted: true },
  }),
  visit({ id: 'cancelled1', state: 'CANCELLED', description: 'Manicure' }),
  visit({ id: 'noShow', state: 'NO_SHOW', description: 'Pedicure' }),
];

const page = (
  items: ClientVisit[],
  fields: Partial<ClientVisitPage> = {},
): ClientVisitPage => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  stats: {
    visits: items.length,
    cancelled: 2,
    noShow: 1,
    lastVisitAt: '2020-04-01T08:30:00.000Z',
  },
  ...fields,
});

const EMPLOYEE: MeResponse = { ...OWNER, role: 'EMPLOYEE' };

describe('ClientCardPage', () => {
  async function setup({
    me = OWNER,
    visits = page(VISITS),
    confirm = true,
  }: { me?: MeResponse; visits?: ClientVisitPage; confirm?: boolean } = {}) {
    const open = vi.fn(() => ({ afterClosed: () => of(confirm) }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open } },
        { provide: AuthService, useValue: { me: signal(me) } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ClientCardPage);
    fixture.componentRef.setInput('id', ID);
    fixture.detectChanges();
    http.expectOne(URL).flush(ANNA);
    http.expectOne((req) => req.url === `${URL}/visits`).flush(visits);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const text = (selector: string) =>
      el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ??
      '';
    const rows = () =>
      [...el.querySelectorAll('li.visit')].map((li) =>
        [...li.children]
          .map((line) => line.textContent?.replace(/\s+/g, ' ').trim())
          .join(' | '),
      );
    const stats = () =>
      [...el.querySelectorAll('.stats > div')].map(
        (item) =>
          `${item.querySelector('dt')?.textContent?.trim()}: ${item.querySelector('dd')?.textContent?.trim()}`,
      );
    // Material puts the label apart from the icon.
    const button = (label: string) =>
      [...el.querySelectorAll<HTMLElement>('button, a')].find(
        (b) =>
          b.querySelector('.mdc-button__label')?.textContent?.trim() === label,
      ) ?? null;
    return { http, el, open, settle, text, stats, rows, button };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows the data, the notes and the stats, two cancellations among them', async () => {
    const { text, stats } = await setup();

    expect(text('h1')).toBe('Anna Nowak');
    expect(text('.phone')).toBe('+48 600 100 200');
    expect(text('.notes')).toBe('Woli rano');
    expect(stats()).toEqual([
      'Wizyty: 5',
      'Odwołane: 2',
      'Nieodbyte: 1',
      'Ostatnia Wizyta: 1.04.2020',
    ]);
  });

  it('lists the Wizyty with their Stan, Usługi and person, also an Usunięta osoba z Personelu', async () => {
    const { rows } = await setup();

    expect(rows()).toEqual([
      '5.01.2099, 14:00 · Zaplanowana | Strzyżenie damskie, Modelowanie | Ewa',
      '4.05.2020, 12:00 · Odwołana | Koloryzacja | Ewa',
      '1.04.2020, 10:30 · Odbyta | Grzywka | Kasia (usunięta)',
      '2.03.2020, 10:00 · Odwołana | Manicure | Ewa',
      '2.03.2020, 10:00 · Nieodbyta | Pedicure | Ewa',
    ]);
  });

  it('has no last Wizyta and an empty list for a new Klient', async () => {
    const { stats, el } = await setup({
      visits: page([], {
        stats: { visits: 0, cancelled: 0, noShow: 0, lastVisitAt: null },
      }),
    });

    expect(stats()).toEqual([
      'Wizyty: 0',
      'Odwołane: 0',
      'Nieodbyte: 0',
      'Ostatnia Wizyta: brak',
    ]);
    expect(el.textContent).toContain('Ten Klient nie ma jeszcze Wizyt.');
  });

  it('pages through the Wizyty', async () => {
    const { http, settle, button, text } = await setup({
      visits: page(VISITS.slice(0, 2), { pageSize: 2, total: 3 }),
    });

    expect(text('.pages span')).toBe('1–2 z 3');
    button('Następna')?.click();
    await settle();
    http
      .expectOne(
        (req) => req.url === `${URL}/visits` && req.params.get('page') === '2',
      )
      .flush(page(VISITS.slice(2, 3), { page: 2, pageSize: 2, total: 3 }));
    await settle();

    expect(text('.pages span')).toBe('3–3 z 3');
    expect(button('Następna')?.hasAttribute('disabled')).toBe(true);
  });

  it('opens the Wizyta form with the Klient picked', async () => {
    const { button } = await setup();

    expect(button('Nowa Wizyta')?.getAttribute('href')).toBe(
      `/panel/kalendarz?klient=${ID}`,
    );
  });

  it('lets the Właściciel delete the Klient and goes back to the Kartoteka', async () => {
    const { http, open, settle, button } = await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    button('Usuń Klienta')?.click();
    await settle();

    expect(open).toHaveBeenCalledWith(DeleteClientDialog, {
      data: { name: 'Anna Nowak' },
    });
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await settle();
    expect(navigate).toHaveBeenCalledWith('/panel/klienci');
  });

  it('does not delete when the Właściciel changes their mind', async () => {
    const { settle, button } = await setup({ confirm: false });

    button('Usuń Klienta')?.click();
    await settle();
    // afterEach verifies no DELETE went out.
  });

  it('has no delete for a Pracownik', async () => {
    const { button } = await setup({ me: EMPLOYEE });

    expect(button('Usuń Klienta')).toBeNull();
    expect(button('Nowa Wizyta')).not.toBeNull();
  });

  it('keeps the error of the Klient when their Wizyty load', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: AuthService, useValue: { me: signal(OWNER) } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ClientCardPage);
    fixture.componentRef.setInput('id', ID);
    fixture.detectChanges();
    http
      .expectOne(URL)
      .flush(null, { status: 500, statusText: 'Server Error' });
    http.expectOne((req) => req.url === `${URL}/visits`).flush(page(VISITS));
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'błąd serwera',
    );
  });

  it('says so when the Klient is not in the Kartoteka', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: AuthService, useValue: { me: signal(OWNER) } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ClientCardPage);
    fixture.componentRef.setInput('id', ID);
    fixture.detectChanges();
    http.expectOne(URL).flush(null, { status: 404, statusText: 'Not Found' });
    http
      .expectOne((req) => req.url === `${URL}/visits`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    // Both requests fail the same way; it is said once.
    const alerts = [...el.querySelectorAll('[role="alert"]')];
    expect(alerts.map((a) => a.textContent?.trim())).toEqual([
      'Nie ma takiego Klienta w Kartotece.',
    ]);
  });
});

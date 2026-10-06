import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import {
  StaffMemberView,
  VisitChangePage,
  VisitChangeView,
  VisitSnapshot,
} from '@bookit/shared';
import { VisitChangesPage } from './visit-changes-page';

const URL = '/api/visit-changes';

const visit: VisitSnapshot = {
  staffMemberId: 'ewa',
  staffMemberName: 'Ewa',
  clientId: 'anna',
  clientName: 'Anna Nowak',
  startsAt: '2026-10-05T12:00:00.000Z',
  durationMin: 60,
  breakMin: 0,
  description: null,
  state: 'SCHEDULED',
  services: [],
};

const MOVED: VisitChangeView = {
  id: 'c2',
  visitId: 'v1',
  at: '2026-09-30T10:05:00.000Z',
  action: 'UPDATED',
  staffMemberId: 'kasia',
  staffMemberName: 'Kasia',
  before: visit,
  after: { ...visit, startsAt: '2026-10-05T13:30:00.000Z' },
};
const CREATED: VisitChangeView = {
  ...MOVED,
  id: 'c1',
  at: '2026-09-30T09:00:00.000Z',
  action: 'CREATED',
  staffMemberName: 'Ewa',
  before: null,
  after: visit,
};

const person = (id: string, displayName: string): StaffMemberView => ({
  id,
  displayName,
  email: `${id}@bookit.test`,
  role: 'EMPLOYEE',
  invitation: 'ACCEPTED',
  acceptsVisits: true,
  showOnPage: true,
  photoId: null,
  bio: null,
});

const page = (
  items: VisitChangeView[],
  fields: Partial<VisitChangePage> = {},
): VisitChangePage => ({
  items,
  page: 1,
  pageSize: 50,
  total: items.length,
  ...fields,
});

describe('VisitChangesPage', () => {
  async function setup(first: VisitChangePage = page([MOVED, CREATED])) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(VisitChangesPage);
    fixture.detectChanges();
    http
      .expectOne('/api/staff')
      .flush([person('kasia', 'Kasia'), person('ewa', 'Ewa')]);
    http.expectOne((req) => req.url === URL).flush(first);
    // The Klient search asks for the first Klienci at once.
    http.match((req) => req.url === '/api/clients').forEach((r) => r.flush([]));
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const rows = () =>
      [...el.querySelectorAll('li.change')].map((li) =>
        [...li.children]
          .map((line) => line.textContent?.replace(/\s+/g, ' ').trim())
          .join(' | '),
      );
    const button = (label: string) => {
      const found = [...el.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === label,
      );
      if (!found) throw new Error(`No button "${label}"`);
      return found;
    };
    return { http, el, settle, rows, button };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists the changes with who made them, when and what changed', async () => {
    const { rows } = await setup();

    expect(rows()).toEqual([
      'Kasia · 30.09.2026, 12:05 | Przesunięcie Wizyty: Anna Nowak | Godzina: 5.10.2026, 14:00 → 15:30',
      'Ewa · 30.09.2026, 11:00 | Nowa Wizyta: Anna Nowak | 5.10.2026, 14:00, Ewa',
    ]);
  });

  it('asks again with the person and day picked', async () => {
    const { el, http, settle, rows } = await setup();

    const select = el.querySelector<HTMLSelectElement>(
      'select[name="staffId"]',
    );
    if (!select) throw new Error('No person filter');
    select.value = 'ewa';
    select.dispatchEvent(new Event('change'));
    await settle();
    http
      .expectOne(
        (req) => req.url === URL && req.params.get('staffId') === 'ewa',
      )
      .flush(page([CREATED]));

    const day = el.querySelector<HTMLInputElement>('input[name="day"]');
    if (!day) throw new Error('No day filter');
    day.value = '2026-09-30';
    day.dispatchEvent(new Event('change'));
    await settle();
    http
      .expectOne(
        (req) =>
          req.url === URL &&
          req.params.get('staffId') === 'ewa' &&
          req.params.get('day') === '2026-09-30',
      )
      .flush(page([CREATED]));
    await settle();

    expect(rows()).toHaveLength(1);
  });

  it('pages through the changes', async () => {
    const { http, settle, button, el } = await setup(
      page(
        Array.from({ length: 50 }, (_, i) => ({ ...MOVED, id: `c${i}` })),
        { total: 51 },
      ),
    );
    expect(el.textContent).toContain('1–50 z 51');

    button('Następna').click();
    await settle();
    http
      .expectOne((req) => req.url === URL && req.params.get('page') === '2')
      .flush(page([CREATED], { page: 2, total: 51 }));
    await settle();

    expect(el.textContent).toContain('51–51 z 51');
    expect(button('Następna').disabled).toBe(true);
    expect(button('Poprzednia').disabled).toBe(false);
  });

  it('says when there are no changes', async () => {
    const { el } = await setup(page([]));

    expect(el.textContent).toContain('Brak zmian');
  });
});

import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import {
  CalendarVisit,
  DELETED_CLIENT_NAME,
  MeResponse,
  VISIT_COLLISION,
} from '@bookit/shared';
import { of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { OWNER } from '../auth/me.fixtures';
import { VisitCard, VisitCardData } from './visit-card';

const EMPLOYEE: MeResponse = { ...OWNER, role: 'EMPLOYEE' };

const VISIT: CalendarVisit = {
  id: 'v1',
  staffMemberId: 'kasia',
  clientId: 'c1',
  // 10:00–11:15 in Warsaw.
  startsAt: '2026-11-12T09:00:00.000Z',
  durationMin: 75,
  breakMin: 10,
  description: 'Grzywka krócej',
  state: 'SCHEDULED',
  services: [
    {
      serviceId: 's1',
      name: 'Strzyżenie',
      priceGrosze: 9000,
      priceType: 'FROM',
    },
  ],
  createdById: 'kasia',
  updatedById: 'kasia',
  client: { name: 'Anna Nowak', phoneE164: '+48600100200' },
};

describe('VisitCard', () => {
  async function setup({
    visit = VISIT,
    me = OWNER,
    confirm = true,
  }: { visit?: CalendarVisit; me?: MeResponse; confirm?: boolean } = {}) {
    const close = vi.fn();
    const data: VisitCardData = {
      visit,
      staff: [{ id: 'kasia', displayName: 'Kasia', visibleUntil: null }],
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { me: signal(me) } },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const open = vi
      .spyOn(TestBed.inject(MatDialog), 'open')
      .mockReturnValue({ afterClosed: () => of(confirm) } as never);
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(VisitCard);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const button = (text: string) => {
      const found = [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.trim().endsWith(text),
      );
      if (!found) throw new Error(`No button "${text}"`);
      return found;
    };
    const click = async (text: string) => {
      button(text).click();
      await settle();
    };
    const text = () => el.textContent?.replace(/\s+/g, ' ') ?? '';
    return { http, close, open, el, settle, button, click, text };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows the Wizyta and links to the karta Klienta', async () => {
    const { el, text } = await setup();
    expect(el.querySelector('h2 a')?.getAttribute('href')).toBe(
      '/panel/klienci/c1',
    );
    expect(text()).toContain('Zaplanowana');
    expect(text()).toContain('12.11.2026, 10:00–11:15 (+10 min Przerwy)');
    expect(text()).toContain('Kasia');
    expect(text()).toContain('+48 600 100 200');
    expect(text()).toContain('Strzyżenieod 90 zł');
    expect(text()).toContain('Grzywka krócej');
  });

  it('has no link for an Usunięty Klient', async () => {
    const { el, text } = await setup({
      visit: {
        ...VISIT,
        client: { name: DELETED_CLIENT_NAME, phoneE164: null },
      },
    });
    expect(el.querySelector('h2 a')).toBeNull();
    expect(text()).toContain(DELETED_CLIENT_NAME);
  });

  it('"Odwołaj" keeps the card open with "Przywróć"', async () => {
    const { http, click, text, settle, button } = await setup();
    await click('Odwołaj');
    http
      .expectOne({ url: '/api/visits/v1/cancel', method: 'POST' })
      .flush({ ...VISIT, state: 'CANCELLED' });
    await settle();
    expect(text()).toContain('Odwołana');
    expect(() => button('Odwołaj')).toThrow();
    expect(button('Przywróć')).toBeTruthy();
  });

  it('"Nie przyszedł" marks the Wizyta Nieodbyta', async () => {
    const { http, click, text, settle } = await setup();
    await click('Nie przyszedł');
    http
      .expectOne({ url: '/api/visits/v1/no-show', method: 'POST' })
      .flush({ ...VISIT, state: 'NO_SHOW' });
    await settle();
    expect(text()).toContain('Nieodbyta');
  });

  it('"Przywróć" with a Kolizja asks for "Przywróć mimo to"', async () => {
    const { http, click, text, settle } = await setup({
      visit: { ...VISIT, state: 'NO_SHOW' },
    });
    await click('Przywróć');
    const first = http.expectOne('/api/visits/v1/restore');
    expect(first.request.body).toEqual({});
    first.flush(
      {
        statusCode: 409,
        error: 'Conflict',
        message: VISIT_COLLISION,
        collisions: [
          {
            type: 'absence',
            id: 'a1',
            startsAt: '2026-11-12T08:00:00.000Z',
            endsAt: '2026-11-12T12:00:00.000Z',
            label: 'Lekarz',
          },
        ],
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(text()).toContain('12.11.2026, 09:00–13:00 Lekarz');

    await click('Przywróć mimo to');
    const second = http.expectOne('/api/visits/v1/restore');
    expect(second.request.body).toEqual({ acceptCollisions: true });
    second.flush({ ...VISIT, state: 'SCHEDULED' });
    await settle();
    expect(text()).toContain('Zaplanowana');
    expect(text()).not.toContain(VISIT_COLLISION);
  });

  it('"Usuń" asks first and closes once removed', async () => {
    const { http, click, close, open, settle } = await setup();
    await click('Usuń');
    expect(open).toHaveBeenCalled();
    http
      .expectOne({ url: '/api/visits/v1', method: 'DELETE' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    expect(close).toHaveBeenCalledWith();
  });

  it('"Usuń" cancelled removes nothing', async () => {
    const { click, close } = await setup({ confirm: false });
    await click('Usuń');
    expect(close).not.toHaveBeenCalled();
  });

  it('"Edytuj" closes asking for the form', async () => {
    const { click, close } = await setup();
    await click('Edytuj');
    expect(close).toHaveBeenCalledWith({ edit: VISIT });
  });

  it('the Historia tab is only for the Właściciel', async () => {
    const owner = await setup();
    expect(owner.text()).toContain('Historia');
    TestBed.resetTestingModule();
    const employee = await setup({ me: EMPLOYEE });
    expect(employee.text()).not.toContain('Historia');
  });
});

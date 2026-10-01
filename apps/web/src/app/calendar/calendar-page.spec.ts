import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import localePl from '@angular/common/locales/pl';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { CalendarResponse, CalendarVisit } from '@bookit/shared';
import { CalendarDayGrid, CalendarSlot } from './calendar-day-grid';
import { CalendarPage } from './calendar-page';
import { MoveCollisionsDialog } from './move-collisions-dialog';
import { VisitDialog } from './visit-dialog';
import { VisitMove } from './visit-drag';

registerLocaleData(localePl);

const visit = (
  id: string,
  startsAt: string,
  fields: Partial<CalendarVisit> = {},
): CalendarVisit => ({
  id,
  staffMemberId: 'kasia',
  clientId: 'c1',
  startsAt,
  durationMin: 45,
  breakMin: 10,
  description: null,
  state: 'SCHEDULED',
  services: [
    {
      serviceId: 's1',
      name: 'Strzyżenie damskie',
      priceGrosze: 9000,
      priceType: 'FROM',
    },
  ],
  createdById: 'kasia',
  updatedById: 'kasia',
  client: { name: 'Anna Nowak', phoneE164: null },
  ...fields,
});

// 11 November 2026 is a Wednesday and an Święto; 10:00 in Warsaw is 09:00Z.
const DAY = '2026-11-11';
const CALENDAR: CalendarResponse = {
  staff: [
    { id: 'magda', displayName: 'Magda', visibleUntil: null },
    { id: 'kasia', displayName: 'Kasia', visibleUntil: null },
    { id: 'ola', displayName: 'Ola', visibleUntil: null },
    { id: 'ewa', displayName: 'Ewa', visibleUntil: DAY },
  ],
  visits: [
    visit('v1', '2026-11-11T09:00:00Z'),
    visit('v2', '2026-11-11T13:00:00Z', {
      services: [],
      description: 'Konsultacja przed ślubem',
      state: 'NO_SHOW',
    }),
  ],
  absences: [
    {
      id: 'a1',
      staffMemberId: 'ola',
      startsAt: '2026-11-11T11:00:00Z',
      endsAt: '2026-11-11T12:00:00Z',
      reason: 'Lekarz',
    },
  ],
  holidays: [{ date: DAY, name: 'Święto Niepodległości' }],
  openingHours: [
    { weekday: 3, opensAt: '09:00', closesAt: '19:00' },
    { weekday: 6, opensAt: '09:00', closesAt: '15:00' },
  ],
};

const text = (el: Element | null | undefined) =>
  el?.textContent?.replace(/\s+/g, ' ').trim();

describe('CalendarPage', () => {
  async function setup(url = `/panel/kalendarz?dzien=${DAY}`) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(
          [{ path: 'panel/kalendarz', component: CalendarPage }],
          withComponentInputBinding(),
        ),
        { provide: LOCALE_ID, useValue: 'pl' },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create(url);
    const el = harness.routeNativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await harness.fixture.whenStable();
      harness.detectChanges();
    };
    const flush = async (day: string, body: CalendarResponse | null) => {
      const req = http.expectOne(
        (r) =>
          r.url === '/api/calendar' &&
          r.params.get('from') === day &&
          r.params.get('to') === day,
      );
      if (body) req.flush(body);
      else req.flush({ statusCode: 500 }, { status: 500, statusText: 'Error' });
      await settle();
    };
    return { http, harness, el, settle, flush };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows the day with its Święto and a column for every person', async () => {
    const { el, flush } = await setup();
    await flush(DAY, CALENDAR);

    expect(text(el.querySelector('h1'))).toBe('środa, 11 listopada 2026');
    expect(text(el.querySelector('.holiday'))).toBe('Święto Niepodległości');
    expect([...el.querySelectorAll('.name')].map(text)).toEqual([
      'Magda',
      'Kasia',
      'Ola',
      'Ewa (usunięta)',
    ]);
  });

  it('draws a Wizyta with its time, Klient and Usługi, and a Nieodbyta one crossed out', async () => {
    const { el, flush } = await setup();
    await flush(DAY, CALENDAR);

    const [first, second] = [...el.querySelectorAll<HTMLElement>('.visit')];
    expect(first.getAttribute('aria-label')).toBe(
      '10:00–10:45, Anna Nowak, Strzyżenie damskie',
    );
    expect(first.classList).not.toContain('no-show');
    expect(second.getAttribute('aria-label')).toBe(
      '14:00–14:45, Anna Nowak, Konsultacja przed ślubem, Nieodbyta',
    );
    expect(second.classList).toContain('no-show');
    expect(text(el.querySelector('.absence'))).toBe('Lekarz');
  });

  it('goes to the day before and after, and to a picked date', async () => {
    const { el, flush } = await setup();
    await flush(DAY, CALENDAR);

    const link = (label: string) =>
      el.querySelector(`a[aria-label="${label}"]`)?.getAttribute('href');
    expect(link('Poprzedni dzień')).toBe('/panel/kalendarz?dzien=2026-11-10');
    expect(link('Następny dzień')).toBe('/panel/kalendarz?dzien=2026-11-12');

    const input = el.querySelector<HTMLInputElement>('input[type="date"]');
    if (!input) throw new Error('No date input');
    input.value = '2026-11-14';
    input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r));
    await flush('2026-11-14', {
      ...CALENDAR,
      visits: [],
      absences: [],
      holidays: [],
    });

    expect(text(el.querySelector('h1'))).toBe('sobota, 14 listopada 2026');
    expect(el.querySelector('.holiday')).toBeNull();
  });

  it('opens the Wizyta form at the empty field clicked', async () => {
    const { el, flush } = await setup();
    await flush(DAY, CALENDAR);
    const open = vi
      .spyOn(TestBed.inject(MatDialog), 'open')
      .mockReturnValue({ afterClosed: () => of(undefined) } as never);

    el.querySelector<HTMLButtonElement>(
      'button[aria-label="Kasia, 9:15"]',
    )?.click();

    expect(open).toHaveBeenCalledWith(
      VisitDialog,
      expect.objectContaining({
        data: {
          staff: CALENDAR.staff,
          staffMemberId: 'kasia',
          startsAt: new Date('2026-11-11T08:15:00Z'),
        },
      }),
    );
  });

  it('opens the form with the Klient of ?klient= and takes it off the address', async () => {
    const { flush, http, settle } = await setup(
      `/panel/kalendarz?dzien=${DAY}&klient=c1`,
    );
    const open = vi
      .spyOn(TestBed.inject(MatDialog), 'open')
      .mockReturnValue({ afterClosed: () => of(undefined) } as never);
    await flush(DAY, CALENDAR);
    const client = {
      id: 'c1',
      name: 'Anna Nowak',
      phoneE164: null,
      notes: null,
    };
    http.expectOne('/api/clients/c1').flush(client);
    await settle();

    expect(open).toHaveBeenCalledWith(
      VisitDialog,
      expect.objectContaining({
        data: { staff: CALENDAR.staff, day: DAY, client },
      }),
    );
    expect(TestBed.inject(Router).url).toBe(`/panel/kalendarz?dzien=${DAY}`);
  });

  describe('a dragged Wizyta', () => {
    const before = CALENDAR.visits[0];
    // To Ola, an hour later.
    const after = {
      ...before,
      staffMemberId: 'ola',
      startsAt: '2026-11-11T10:00:00.000Z',
    };
    const COLLISION = {
      statusCode: 409,
      error: 'Conflict',
      message: 'Wizyta nachodzi na inne wpisy tej osoby',
      collisions: [
        {
          type: 'absence',
          id: 'a1',
          startsAt: '2026-11-11T11:00:00Z',
          endsAt: '2026-11-11T12:00:00Z',
          label: 'Lekarz',
        },
      ],
    };

    async function dragged() {
      const page = await setup();
      await page.flush(DAY, CALENDAR);
      const drop = (move: VisitMove) => {
        page.harness.fixture.debugElement
          .query(By.directive(CalendarDayGrid))
          .triggerEventHandler('visitMove', move);
        page.harness.detectChanges();
      };
      const label = () =>
        page.el.querySelector('.visit')?.getAttribute('aria-label');
      const column = () =>
        page.el
          .querySelector<HTMLElement>('.visit')
          ?.style.getPropertyValue('grid-column');
      const patch = () =>
        page.http.expectOne(
          (r) => r.method === 'PATCH' && r.url === '/api/visits/v1',
        );
      // `whenStable` would wait for the request still open.
      const tick = async () => {
        await new Promise((r) => setTimeout(r));
        page.harness.detectChanges();
      };
      return { ...page, drop, label, column, patch, tick };
    }

    it('shows at once where it was dropped and saves only the person and time', async () => {
      const { drop, label, column, patch, flush, tick } = await dragged();

      drop({ before, after });

      expect(label()).toMatch(/^11:00–11:45/);
      // Ola is the third column after the time axis.
      expect(column()).toBe('4');
      const req = patch();
      expect(req.request.body).toEqual({
        staffMemberId: 'ola',
        startsAt: '2026-11-11T10:00:00.000Z',
      });
      req.flush(after);
      await tick();
      await flush(DAY, { ...CALENDAR, visits: [after, CALENDAR.visits[1]] });
      expect(label()).toMatch(/^11:00–11:45/);
    });

    it('goes back to where it was with a message when the save fails', async () => {
      const { drop, label, column, patch, settle } = await dragged();
      const snack = vi.spyOn(TestBed.inject(MatSnackBar), 'open');

      drop({ before, after });
      patch().error(new ProgressEvent('error'), { status: 0 });
      await settle();

      expect(label()).toMatch(/^10:00–10:45/);
      expect(column()).toBe('3');
      expect(snack).toHaveBeenCalledWith(
        'Nie przeniesiono Wizyty. Nie udało się połączyć z serwerem. Sprawdź internet i spróbuj ponownie.',
        'OK',
        expect.anything(),
      );
    });

    it('saves despite a Kolizja after "Zapisz mimo to"', async () => {
      const { drop, label, patch, tick, flush } = await dragged();
      const open = vi
        .spyOn(TestBed.inject(MatDialog), 'open')
        .mockReturnValue({ afterClosed: () => of(true) } as never);

      drop({ before, after });
      patch().flush(COLLISION, { status: 409, statusText: 'Conflict' });
      await tick();

      expect(open).toHaveBeenCalledWith(
        MoveCollisionsDialog,
        expect.objectContaining({ data: COLLISION.collisions }),
      );
      const again = patch();
      expect(again.request.body).toEqual({
        staffMemberId: 'ola',
        startsAt: '2026-11-11T10:00:00.000Z',
        acceptCollisions: true,
      });
      again.flush(after);
      await tick();
      await flush(DAY, { ...CALENDAR, visits: [after, CALENDAR.visits[1]] });
      expect(label()).toMatch(/^11:00–11:45/);
    });

    it('goes back without a message after "Cofnij" on the Kolizje', async () => {
      const { drop, label, patch, settle } = await dragged();
      vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({
        afterClosed: () => of(false),
      } as never);
      const snack = vi.spyOn(TestBed.inject(MatSnackBar), 'open');

      drop({ before, after });
      patch().flush(COLLISION, { status: 409, statusText: 'Conflict' });
      await settle();

      expect(label()).toMatch(/^10:00–10:45/);
      expect(snack).not.toHaveBeenCalled();
    });
  });

  it('shows the error of a failed load', async () => {
    const { el, flush } = await setup();
    await flush(DAY, null);

    expect(text(el.querySelector('[role="alert"]'))).toBe(
      'Wystąpił błąd serwera. Spróbuj ponownie za chwilę.',
    );
  });
});

describe('CalendarDayGrid', () => {
  function setup(day = DAY, calendar = CALENDAR) {
    const fixture = TestBed.createComponent(CalendarDayGrid);
    fixture.componentRef.setInput('day', day);
    fixture.componentRef.setInput('calendar', calendar);
    fixture.componentRef.setInput(
      'currentTime',
      new Date('2026-11-11T09:20:00Z'),
    );
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('emits the person and the start of the quarter of an empty field', () => {
    const { fixture, el } = setup();
    const picked: CalendarSlot[] = [];
    fixture.componentInstance.slotClick.subscribe((slot) => picked.push(slot));

    el.querySelector<HTMLButtonElement>(
      'button[aria-label="Kasia, 9:15"]',
    )?.click();

    expect(picked).toEqual([
      { staffMemberId: 'kasia', startsAt: new Date('2026-11-11T08:15:00Z') },
    ]);
  });

  it('takes no new Wizyta for an Usunięta osoba z Personelu', () => {
    const { el } = setup();

    expect(
      el.querySelector<HTMLButtonElement>('button[aria-label="Ewa, 9:15"]')
        ?.disabled,
    ).toBe(true);
  });

  it('emits the Wizyta clicked', () => {
    const { fixture, el } = setup();
    const opened: CalendarVisit[] = [];
    fixture.componentInstance.visitClick.subscribe((v) => opened.push(v));

    el.querySelector<HTMLButtonElement>('.visit')?.click();

    expect(opened.map((v) => v.id)).toEqual(['v1']);
  });

  it('lets Wizyty be dragged only when editable', () => {
    const { fixture, el } = setup();
    const visits = () => [...el.querySelectorAll('.visit')];

    expect(
      visits().every((v) => v.classList.contains('cdk-drag-disabled')),
    ).toBe(true);
    expect(el.querySelector('.resize')).toBeNull();

    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();

    expect(
      visits().some((v) => v.classList.contains('cdk-drag-disabled')),
    ).toBe(false);
    expect(el.querySelectorAll('.resize')).toHaveLength(2);
  });

  it('greys the hours outside the Godziny otwarcia, all of Saturday after 15:00', () => {
    const { el } = setup('2026-11-14', {
      ...CALENDAR,
      visits: [],
      absences: [],
    });

    // 7:00–21:00 in minute rows: closed 7:00–9:00 and 15:00–21:00.
    expect(
      [...el.querySelectorAll<HTMLElement>('.closed')].map((c) =>
        c.style.getPropertyValue('grid-row'),
      ),
    ).toEqual(['1 / span 120', '481 / span 360']);
  });

  it('draws the line of the current hour only on today', () => {
    expect(setup().el.querySelector('.now')).not.toBeNull();
    expect(setup('2026-11-12').el.querySelector('.now')).toBeNull();
  });
});

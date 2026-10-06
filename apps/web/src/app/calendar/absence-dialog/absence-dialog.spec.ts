import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  ABSENCE_ENDS_BEFORE_START,
  AbsenceView,
  CalendarStaffMember,
} from '@bookit/shared';
import { AbsenceDialog, AbsenceDialogData } from './absence-dialog';
import { AbsenceFields } from '../absence-request';

const STAFF: CalendarStaffMember[] = [
  { id: 'kasia', displayName: 'Kasia', visibleUntil: null },
  { id: 'ola', displayName: 'Ola', visibleUntil: null },
  { id: 'ewa', displayName: 'Ewa', visibleUntil: '2026-11-30' },
];

const ABSENCE: AbsenceView = {
  id: 'a1',
  staffMemberId: 'kasia',
  // 10:00–12:30 in Warsaw.
  startsAt: '2026-11-13T09:00:00.000Z',
  endsAt: '2026-11-13T11:30:00.000Z',
  reason: 'Lekarz',
};

describe('AbsenceDialog', () => {
  async function setup(data: Partial<AbsenceDialogData> = {}) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MAT_DIALOG_DATA,
          useValue: { staff: STAFF, day: '2026-11-13', ...data },
        },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AbsenceDialog);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const dialog = fixture.componentInstance as unknown as {
      model: WritableSignal<AbsenceFields>;
    };
    const formField = (label: string) =>
      [...el.querySelectorAll('mat-form-field')].find(
        (f) => f.querySelector('mat-label')?.textContent?.trim() === label,
      );
    const field = (label: string) =>
      formField(label)?.querySelector('input') as HTMLInputElement | undefined;
    const button = (text: string) => {
      const found = [...el.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === text,
      );
      if (!found) throw new Error(`No button "${text}"`);
      return found;
    };
    const submit = async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    const fill = async (fields: Partial<AbsenceFields>) => {
      dialog.model.update((m) => ({ ...m, ...fields }));
      await settle();
    };
    const text = () => el.textContent ?? '';
    return {
      http,
      close,
      el,
      settle,
      formField,
      field,
      button,
      submit,
      fill,
      text,
    };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('starts as the whole day shown, for the person it was opened for', async () => {
    const { field, el, text } = await setup({ staffMemberId: 'ola' });
    expect(text()).toContain('Nowa Nieobecność');
    expect(field('Od')?.value).toBe('2026-11-13');
    expect(field('Do')?.value).toBe('2026-11-13');
    expect(field('Od godziny')).toBeUndefined();
    expect(el.querySelector('mat-select')?.textContent).toContain('Ola');
    expect(text()).not.toContain('(usunięta)');
  });

  it('adds whole days over the change of the clocks', async () => {
    const { http, close, fill, submit, settle } = await setup({
      staffMemberId: 'kasia',
    });
    await fill({ fromDay: '2026-10-24', toDay: '2026-10-26', reason: 'Urlop' });
    await submit();
    const req = http.expectOne({ url: '/api/absences', method: 'POST' });
    expect(req.request.body).toEqual({
      staffMemberId: 'kasia',
      startsAt: '2026-10-23T22:00:00.000Z',
      endsAt: '2026-10-26T23:00:00.000Z',
      reason: 'Urlop',
    });
    req.flush({ id: 'a2' });
    await settle();
    expect(close).toHaveBeenCalledWith(true);
  });

  it('shows the times without "Cały dzień"', async () => {
    const { el, field, settle } = await setup();
    el.querySelector<HTMLButtonElement>('mat-slide-toggle button')?.click();
    await settle();
    expect(field('Od godziny')?.value).toBe('09:00');
    expect(field('Do godziny')?.value).toBe('17:00');
  });

  it('asks for the person', async () => {
    const { http, submit, text } = await setup();
    await submit();
    http.expectNone('/api/absences');
    expect(text()).toContain('Wybierz osobę');
  });

  it('shows the end before the start from the API under "Do" until the time changes', async () => {
    const { http, close, formField, fill, submit, settle } = await setup({
      staffMemberId: 'kasia',
    });
    await fill({ allDay: false, fromTime: '12:00', toTime: '11:00' });
    await submit();
    http.expectOne({ url: '/api/absences', method: 'POST' }).flush(
      {
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: ABSENCE_ENDS_BEFORE_START,
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle();
    const to = formField('Do');
    expect(to?.querySelector('mat-error')?.textContent).toContain(
      ABSENCE_ENDS_BEFORE_START,
    );
    expect(close).not.toHaveBeenCalled();

    // Not sent again unchanged; an earlier start clears it.
    await submit();
    http.expectNone('/api/absences');
    await fill({ fromTime: '10:00' });
    expect(to?.querySelector('mat-error')).toBeNull();
    await submit();
    http
      .expectOne({ url: '/api/absences', method: 'POST' })
      .flush({ id: 'a2' });
    await settle();
    expect(close).toHaveBeenCalledWith(true);
  });

  it('edits a Nieobecność with only what changed', async () => {
    const { http, close, field, fill, submit, settle, text } = await setup({
      absence: ABSENCE,
    });
    expect(text()).toContain('Edycja Nieobecności');
    expect(field('Od godziny')?.value).toBe('10:00');
    expect(field('Do godziny')?.value).toBe('12:30');
    await fill({ toTime: '13:00' });
    await submit();
    const req = http.expectOne({ url: '/api/absences/a1', method: 'PATCH' });
    expect(req.request.body).toEqual({ endsAt: '2026-11-13T12:00:00.000Z' });
    req.flush({ ...ABSENCE, endsAt: '2026-11-13T12:00:00.000Z' });
    await settle();
    expect(close).toHaveBeenCalledWith(true);
  });

  it('removes a Nieobecność after asking', async () => {
    const { http, close, button, settle, text } = await setup({
      absence: ABSENCE,
    });
    button('Usuń').click();
    await settle();
    expect(text()).toContain('Usunąć tę Nieobecność?');
    button('Usuń Nieobecność').click();
    await settle();
    http
      .expectOne({ url: '/api/absences/a1', method: 'DELETE' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    expect(close).toHaveBeenCalledWith(true);
  });
});

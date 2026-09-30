import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  ANNOUNCEMENT_ENDS_BEFORE_START,
  ANNOUNCEMENT_TITLE_REQUIRED,
  AnnouncementView,
} from '@bookit/shared';
import {
  AnnouncementDialog,
  AnnouncementDialogData,
  dateToDay,
  dayToDate,
} from './announcement-dialog';

const PROMO: AnnouncementView = {
  id: 'a1',
  title: 'Promocja',
  body: '-20% na koloryzację',
  photoId: 'p1',
  showFrom: '2026-10-01',
  showUntil: '2026-10-31',
};

describe('dayToDate and dateToDay', () => {
  it('go through the local midnight of the day and back', () => {
    const date = dayToDate('2026-03-29');

    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([
      2026, 2, 29,
    ]);
    expect(dateToDay(date)).toBe('2026-03-29');
  });
});

describe('AnnouncementDialog', () => {
  async function setup(data: AnnouncementDialogData) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AnnouncementDialog);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const { form } = fixture.componentInstance as unknown as {
      form: FormGroup;
    };
    const submit = async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    const button = (text: string) =>
      [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes(text),
      );
    const text = () => el.textContent ?? '';
    return { http, close, el, form, settle, submit, button, text };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.useRealTimers();
  });

  it('adds an Ogłoszenie from today in Warsaw, without an end or a photo', async () => {
    // 00:30 on 1 October in Warsaw, still 30 September in UTC.
    vi.useFakeTimers({
      toFake: ['Date'],
      now: new Date('2026-09-30T22:30:00Z'),
    });
    const { http, close, form, submit, settle } = await setup({});

    form.patchValue({ title: ' Nowość ', body: ' Mamy nowy fotel. ' });
    await submit();

    const req = http.expectOne({ url: '/api/announcements', method: 'POST' });
    expect(req.request.body).toEqual({
      title: 'Nowość',
      body: 'Mamy nowy fotel.',
      photoId: null,
      showFrom: '2026-10-01',
      showUntil: null,
    });
    const saved = { ...PROMO, id: 'a2' };
    req.flush(saved);
    await settle();

    expect(close).toHaveBeenCalledWith(saved);
  });

  it('shows the Ogłoszenie being edited and saves the changes', async () => {
    const { http, el, form, submit, settle, close } = await setup({
      announcement: PROMO,
    });

    expect(form.getRawValue()).toEqual({
      title: 'Promocja',
      body: '-20% na koloryzację',
      showFrom: dayToDate('2026-10-01'),
      showUntil: dayToDate('2026-10-31'),
    });
    expect(el.querySelector('app-photo-upload img')?.getAttribute('src')).toBe(
      '/api/public/photos/p1',
    );
    form.patchValue({ showUntil: dayToDate('2026-11-15') });
    await submit();

    const req = http.expectOne({
      url: '/api/announcements/a1',
      method: 'PATCH',
    });
    expect(req.request.body).toEqual({
      title: 'Promocja',
      body: '-20% na koloryzację',
      photoId: 'p1',
      showFrom: '2026-10-01',
      showUntil: '2026-11-15',
    });
    req.flush({ ...PROMO, showUntil: '2026-11-15' });
    await settle();

    expect(close).toHaveBeenCalledOnce();
  });

  it('saves without the photo after "Usuń zdjęcie"', async () => {
    const { http, button, submit, settle } = await setup({
      announcement: PROMO,
    });

    button('Usuń zdjęcie')?.click();
    await settle();
    await submit();

    const req = http.expectOne('/api/announcements/a1');
    expect(req.request.body.photoId).toBeNull();
    req.flush({ ...PROMO, photoId: null });
  });

  it('does not send an end before the start', async () => {
    const { form, submit, text } = await setup({ announcement: PROMO });

    form.patchValue({ showUntil: dayToDate('2026-09-30') });
    await submit();

    expect(text()).toContain(ANNOUNCEMENT_ENDS_BEFORE_START);
  });

  it('does not send an Ogłoszenie without a title', async () => {
    const { form, submit, text } = await setup({});

    form.patchValue({ title: '   ', body: 'Treść' });
    await submit();

    expect(text()).toContain(ANNOUNCEMENT_TITLE_REQUIRED);
  });

  it('stays open with the message from the api', async () => {
    const { http, close, el, submit, settle } = await setup({
      announcement: PROMO,
    });

    await submit();
    http
      .expectOne('/api/announcements/a1')
      .flush(
        {
          message: ANNOUNCEMENT_ENDS_BEFORE_START,
          error: 'Unprocessable Entity',
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await settle();

    expect(close).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      ANNOUNCEMENT_ENDS_BEFORE_START,
    );
  });
});

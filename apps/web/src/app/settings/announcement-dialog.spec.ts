import { HttpBackend, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component, input, output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  ANNOUNCEMENT_ENDS_BEFORE_START,
  ANNOUNCEMENT_TITLE_REQUIRED,
  AnnouncementView,
  PhotoView,
  CropPhotoRequest,
} from '@bookit/shared';
import {
  AnnouncementDialog,
  AnnouncementDialogData,
  dateToDay,
  dayToDate,
} from './announcement-dialog';

import { PhotoCropper } from '../shared/photo-cropper';
import { PHOTO_UPLOAD_BACKEND } from '../shared/photos.service';

@Component({ selector: 'app-photo-cropper', template: '' })
class FakeCropper {
  readonly photo = input.required<PhotoView>();
  readonly round = input(true);
  readonly cropped = output<CropPhotoRequest>();
  readonly cancelled = output<void>();
}
const photo = (id: string): PhotoView => ({
  id,
  url: `/api/public/photos/${id}`,
  width: 1400,
  height: 1400,
  bytes: 1000,
});

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
        { provide: PHOTO_UPLOAD_BACKEND, useExisting: HttpBackend },
        provideNativeDateAdapter(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    TestBed.overrideComponent(AnnouncementDialog, {
      remove: { imports: [PhotoCropper] },
      add: { imports: [FakeCropper] },
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
    const upload = async (id: string) => {
      const picker = el.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(picker, 'files', {
        value: [new File(['png'], 'photo.png')],
        configurable: true,
      });
      picker.dispatchEvent(new Event('change'));
      http.expectOne('/api/photos').flush(photo(id));
      await settle();
    };
    const cropper = () =>
      fixture.debugElement.query(By.directive(FakeCropper))
        .componentInstance as FakeCropper;
    return {
      fixture,
      upload,
      cropper,
      http,
      close,
      el,
      form,
      settle,
      submit,
      button,
      text,
    };
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
    expect(el.querySelector('.photo-preview')?.getAttribute('src')).toBe(
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

  it('saves only an approved square together with the Ogłoszenie', async () => {
    const { upload, cropper, submit, http, settle, close } = await setup({
      announcement: PROMO,
    });
    await upload('source');
    expect(cropper().round()).toBe(false);
    await submit();
    http.expectNone('/api/announcements/a1');
    cropper().cropped.emit({ x: 0, y: 0, size: 1400 });
    const req = http.expectOne('/api/photos/source/crop');
    expect(req.request.body).toEqual({
      x: 0,
      y: 0,
      size: 1400,
      purpose: 'announcement',
    });
    await submit();
    http.expectNone('/api/announcements/a1');
    req.flush(photo('square'));
    await settle();
    await submit();
    const save = http.expectOne('/api/announcements/a1');
    expect(save.request.body.photoId).toBe('square');
    save.flush({ ...PROMO, photoId: 'square' });
    await settle();
    expect(close).toHaveBeenCalledWith({ ...PROMO, photoId: 'square' });
  });

  it('cancels cropping and keeps the previously saved preview', async () => {
    const { upload, cropper, http, settle, el, button, fixture } = await setup({
      announcement: PROMO,
    });
    await upload('source');
    cropper().cancelled.emit();
    http
      .expectOne({ url: '/api/photos/source?unused=true', method: 'DELETE' })
      .flush(null);
    await settle();
    expect(el.querySelector('.photo-preview')?.getAttribute('src')).toBe(
      '/api/public/photos/p1',
    );
    button('Usuń zdjęcie')?.click();
    await settle();
    button('Anuluj')?.click();
    fixture.destroy();
    http.expectNone('/api/photos/p1');
    http.expectNone('/api/announcements/a1');
  });

  it('cleans superseded drafts and keeps only the selected photo after saving', async () => {
    const { upload, cropper, http, settle, submit, fixture } = await setup({
      announcement: PROMO,
    });
    await upload('source1');
    cropper().cropped.emit({ x: 0, y: 0, size: 1400 });
    http.expectOne('/api/photos/source1/crop').flush(photo('square1'));
    await settle();
    await upload('source2');
    cropper().cropped.emit({ x: 0, y: 0, size: 1400 });
    http.expectOne('/api/photos/source2/crop').flush(photo('square2'));
    await settle();
    http
      .expectOne({ url: '/api/photos/square1?unused=true', method: 'DELETE' })
      .flush(null);
    await submit();
    const req = http.expectOne('/api/announcements/a1');
    expect(req.request.body.photoId).toBe('square2');
    req.flush({ ...PROMO, photoId: 'square2' });
    await settle();
    fixture.destroy();
    http.expectNone('/api/photos/square2?unused=true');
    http.expectNone('/api/photos/p1');
  });

  it('retains a draft after a save failure and allows retry', async () => {
    const { upload, cropper, http, settle, submit, close, fixture } =
      await setup({ announcement: PROMO });
    await upload('source');
    cropper().cropped.emit({ x: 0, y: 0, size: 1400 });
    http.expectOne('/api/photos/source/crop').flush(photo('square'));
    await settle();
    await submit();
    http
      .expectOne('/api/announcements/a1')
      .flush(
        { message: 'Spróbuj ponownie' },
        { status: 500, statusText: 'Error' },
      );
    await settle();
    expect(close).not.toHaveBeenCalled();
    http.expectNone('/api/photos/square?unused=true');
    await submit();
    const req = http.expectOne('/api/announcements/a1');
    expect(req.request.body.photoId).toBe('square');
    req.flush({ ...PROMO, photoId: 'square' });
    await settle();
    fixture.destroy();
    http.expectNone('/api/photos/square?unused=true');
  });

  it('cleans the draft after abandoning a failed save', async () => {
    const { upload, cropper, http, settle, submit, fixture } = await setup({
      announcement: PROMO,
    });
    await upload('source');
    cropper().cropped.emit({ x: 0, y: 0, size: 1400 });
    http.expectOne('/api/photos/source/crop').flush(photo('square'));
    await settle();
    await submit();
    http
      .expectOne('/api/announcements/a1')
      .flush({}, { status: 500, statusText: 'Error' });
    await settle();
    fixture.destroy();
    http
      .expectOne({ url: '/api/photos/square?unused=true', method: 'DELETE' })
      .flush(null);
    http.expectNone('/api/photos/p1');
  });

  it('cleans both a draft and a pending source when the dialog is destroyed', async () => {
    const { upload, cropper, http, settle, fixture } = await setup({
      announcement: PROMO,
    });
    await upload('source1');
    cropper().cropped.emit({ x: 0, y: 0, size: 1400 });
    http.expectOne('/api/photos/source1/crop').flush(photo('square'));
    await settle();
    await upload('source2');
    fixture.destroy();
    http.expectOne('/api/photos/square?unused=true').flush(null);
    http.expectOne('/api/photos/source2?unused=true').flush(null);
    http.expectNone('/api/photos/p1');
  });

  it('cleans a crop that finishes after closing, without deleting its source mid-request', async () => {
    const { upload, cropper, http, settle, button, fixture } = await setup({
      announcement: PROMO,
    });
    await upload('source');
    cropper().cropped.emit({ x: 0, y: 0, size: 1400 });
    const req = http.expectOne('/api/photos/source/crop');
    await settle();
    button('Anuluj')?.click();
    fixture.destroy();
    http.expectNone('/api/photos/source?unused=true');
    req.flush(photo('square'));
    await settle();
    http.expectOne('/api/photos/square?unused=true').flush(null);
    http.expectNone('/api/photos/p1');
  });

  it('keeps the saved photo after a crop failure and cleans the source on cancellation', async () => {
    const { upload, cropper, http, settle, button, el, fixture } = await setup({
      announcement: PROMO,
    });
    await upload('source');
    cropper().cropped.emit({ x: 0, y: 0, size: 1400 });
    http
      .expectOne('/api/photos/source/crop')
      .flush(
        { message: 'Błąd kadrowania' },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Spróbuj ponownie',
    );
    cropper().cancelled.emit();
    http.expectOne('/api/photos/source?unused=true').flush(null);
    await settle();
    expect(el.querySelector('.photo-preview')?.getAttribute('src')).toBe(
      '/api/public/photos/p1',
    );
    button('Anuluj')?.click();
    fixture.destroy();
  });

  it('uses guarded cleanup after losing the response to a save', async () => {
    const { upload, cropper, http, settle, submit, fixture } = await setup({
      announcement: PROMO,
    });
    await upload('source');
    cropper().cropped.emit({ x: 0, y: 0, size: 1400 });
    http.expectOne('/api/photos/source/crop').flush(photo('square'));
    await settle();
    await submit();
    http.expectOne('/api/announcements/a1').error(new ProgressEvent('error'));
    await settle();
    fixture.destroy();
    const discard = http.expectOne('/api/photos/square?unused=true');
    expect(discard.request.method).toBe('DELETE');
    discard.flush(null);
    http.expectNone('/api/photos/p1');
  });

  it('retries transient cleanup failures after the dialog is destroyed', async () => {
    const { upload, http, fixture } = await setup({ announcement: PROMO });
    await upload('source');
    fixture.destroy();
    http
      .expectOne('/api/photos/source?unused=true')
      .flush({}, { status: 500, statusText: 'Error' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    http.expectOne('/api/photos/source?unused=true').flush(null);
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
    http.expectOne('/api/announcements/a1').flush(
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

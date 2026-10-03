import { HttpBackend, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import {
  CropPhotoRequest,
  LAST_OWNER,
  PhotoView,
  StaffMemberView,
} from '@bookit/shared';
import { PhotoCropper } from '../shared/photo-cropper';
import { PHOTO_UPLOAD_BACKEND } from '../shared/photos.service';
import { EditStaffDialog } from './edit-staff-dialog';

/** jsdom draws no images, so the test frames the photo itself. */
@Component({ selector: 'app-photo-cropper', template: '' })
class FakeCropper {
  readonly photo = input.required<PhotoView>();
  readonly cropped = output<CropPhotoRequest>();
  readonly cancelled = output<void>();
}

const photoView = (id: string, side: number): PhotoView => ({
  id,
  url: `/api/public/photos/${id}`,
  width: side,
  height: side,
  bytes: 1000,
});

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

describe('EditStaffDialog', () => {
  async function setup(member: StaffMemberView = ANNA) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PHOTO_UPLOAD_BACKEND, useExisting: HttpBackend },
        { provide: MAT_DIALOG_DATA, useValue: member },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    TestBed.overrideComponent(EditStaffDialog, {
      remove: { imports: [PhotoCropper] },
      add: { imports: [FakeCropper] },
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EditStaffDialog);
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
    const click = async (text: string) => {
      const button = [...el.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === text,
      );
      if (!button) throw new Error(`no button ${text}`);
      button.click();
      await settle();
    };
    const profilePhoto = () =>
      el.querySelector('.profile-photo img')?.getAttribute('src') ??
      el.querySelector('.profile-photo')?.textContent?.trim();
    /** Picks a file, uploads it as `uploaded` and frames it into `cropped`. */
    const uploadAndCrop = async (uploaded: PhotoView, cropped: PhotoView) => {
      const picker = el.querySelector<HTMLInputElement>('input[type=file]');
      if (!picker) throw new Error('no file input');
      Object.defineProperty(picker, 'files', {
        value: [new File([new Uint8Array(10)], 'IMG.HEIC')],
        configurable: true,
      });
      picker.dispatchEvent(new Event('change'));
      await settle();
      http
        .expectOne({ url: '/api/photos', method: 'POST' })
        .flush(uploaded, { status: 201, statusText: 'Created' });
      await settle();
      const cropper = fixture.debugElement.query(By.directive(FakeCropper))
        .componentInstance as FakeCropper;
      expect(cropper.photo()).toEqual(uploaded);
      cropper.cropped.emit({ x: 0, y: 100, size: 900 });
      await settle();
      const crop = http.expectOne({
        url: `/api/photos/${uploaded.id}/crop`,
        method: 'POST',
      });
      expect(crop.request.body).toEqual({ x: 0, y: 100, size: 900 });
      crop.flush(cropped, { status: 201, statusText: 'Created' });
      await settle();
    };
    return {
      http,
      close,
      el,
      form,
      fixture,
      settle,
      submit,
      click,
      profilePhoto,
      uploadAndCrop,
    };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('saves the changes and closes with the saved person', async () => {
    const { http, close, form, submit, settle } = await setup();

    form.patchValue({
      displayName: ' Anna K. ',
      acceptsVisits: false,
      bio: '  ',
    });
    await submit();

    const req = http.expectOne({ url: '/api/staff/s1', method: 'PATCH' });
    expect(req.request.body).toEqual({
      displayName: 'Anna K.',
      role: 'OWNER',
      acceptsVisits: false,
      showOnPage: true,
      bio: null,
    });
    const saved = { ...ANNA, displayName: 'Anna K.', acceptsVisits: false };
    req.flush(saved);
    await settle();

    expect(close).toHaveBeenCalledWith(saved);
  });

  it('stays open with the message when the last Właściciel would lose the role', async () => {
    const { http, close, el, form, submit, settle } = await setup();

    form.patchValue({ role: 'EMPLOYEE' });
    await submit();
    http
      .expectOne('/api/staff/s1')
      .flush(
        { message: LAST_OWNER, error: 'Unprocessable Entity' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await settle();

    expect(close).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      LAST_OWNER,
    );
  });

  describe('Zdjęcie profilowe', () => {
    const WITH_PHOTO: StaffMemberView = { ...ANNA, photoId: 'old' };

    it('shows the photo in the circle, or the first letter of the name', async () => {
      const withPhoto = await setup(WITH_PHOTO);
      expect(withPhoto.profilePhoto()).toBe('/api/public/photos/old');
      TestBed.resetTestingModule();

      const without = await setup();
      expect(without.profilePhoto()).toBe('A');
      expect(without.el.textContent).toContain('Wgraj zdjęcie');
      expect(without.el.textContent).not.toContain('Usuń zdjęcie');
    });

    it('saves the cropped photo with the other fields', async () => {
      const { http, close, uploadAndCrop, profilePhoto, submit, settle } =
        await setup(WITH_PHOTO);

      await uploadAndCrop(photoView('up', 1600), photoView('cut', 480));
      expect(profilePhoto()).toBe('/api/public/photos/cut');
      await submit();

      const req = http.expectOne({ url: '/api/staff/s1', method: 'PATCH' });
      expect(req.request.body).toMatchObject({ photoId: 'cut' });
      const saved = { ...WITH_PHOTO, photoId: 'cut' };
      req.flush(saved);
      await settle();
      expect(close).toHaveBeenCalledWith(saved);
    });

    it('on Anuluj deletes every photo uploaded in the dialog and saves nothing', async () => {
      const { http, close, uploadAndCrop, click } = await setup(WITH_PHOTO);
      await uploadAndCrop(photoView('up1', 1600), photoView('cut1', 480));
      await uploadAndCrop(photoView('up2', 1200), photoView('cut2', 480));

      await click('Anuluj');

      const deleted = http.match({ method: 'DELETE' }).map((req) => {
        req.flush(null, { status: 204, statusText: 'No Content' });
        return req.request.url;
      });
      expect(deleted.sort()).toEqual(['/api/photos/cut1', '/api/photos/cut2']);
      http.expectNone({ method: 'PATCH' });
      expect(close).toHaveBeenCalledWith();
    });

    it('deletes the uploaded photos when the dialog closes another way', async () => {
      const { http, fixture, uploadAndCrop } = await setup();
      await uploadAndCrop(photoView('up', 1600), photoView('cut', 480));

      fixture.destroy();

      http
        .expectOne({ url: '/api/photos/cut', method: 'DELETE' })
        .flush(null, { status: 204, statusText: 'No Content' });
    });

    it('after Zapisz deletes only the photos it did not save', async () => {
      const { http, uploadAndCrop, submit, settle, fixture } = await setup();
      await uploadAndCrop(photoView('up1', 1600), photoView('cut1', 480));
      await uploadAndCrop(photoView('up2', 1600), photoView('cut2', 480));

      await submit();
      http
        .expectOne({ url: '/api/staff/s1', method: 'PATCH' })
        .flush({ ...ANNA, photoId: 'cut2' });
      await settle();
      fixture.destroy();

      // cut2 is saved; cut1 was replaced in the dialog.
      http
        .expectOne({ url: '/api/photos/cut1', method: 'DELETE' })
        .flush(null, { status: 204, statusText: 'No Content' });
    });

    it('deletes the uploaded photo at once when its framing is cancelled', async () => {
      const { http, el, fixture, settle, profilePhoto } =
        await setup(WITH_PHOTO);
      const picker = el.querySelector<HTMLInputElement>('input[type=file]');
      Object.defineProperty(picker, 'files', {
        value: [new File([new Uint8Array(10)], 'IMG.HEIC')],
      });
      picker?.dispatchEvent(new Event('change'));
      await settle();
      http
        .expectOne('/api/photos')
        .flush(photoView('up', 1600), { status: 201, statusText: 'Created' });
      await settle();

      (
        fixture.debugElement.query(By.directive(FakeCropper))
          .componentInstance as FakeCropper
      ).cancelled.emit();
      await settle();

      http
        .expectOne({ url: '/api/photos/up', method: 'DELETE' })
        .flush(null, { status: 204, statusText: 'No Content' });
      expect(fixture.debugElement.query(By.directive(FakeCropper))).toBeNull();
      expect(profilePhoto()).toBe('/api/public/photos/old');
    });

    it('on Usuń zdjęcie shows the letter and saves photoId null', async () => {
      const { http, click, profilePhoto, submit } = await setup(WITH_PHOTO);

      await click('Usuń zdjęcie');
      expect(profilePhoto()).toBe('A');
      await submit();

      const req = http.expectOne({ url: '/api/staff/s1', method: 'PATCH' });
      expect(req.request.body).toMatchObject({ photoId: null });
      req.flush({ ...WITH_PHOTO, photoId: null });
    });
  });

  it('does not save without a name', async () => {
    const { http, form, submit } = await setup();

    form.patchValue({ displayName: '' });
    await submit();

    http.expectNone('/api/staff/s1');
  });
});

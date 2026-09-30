import {
  HttpBackend,
  HttpEventType,
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  PHOTO_MAX_BYTES,
  PHOTO_TOO_LARGE,
  PHOTO_UNSUPPORTED_TYPE,
  PhotoView,
} from '@bookit/shared';
import { PhotoUpload } from './photo-upload';
import { PHOTO_UPLOAD_BACKEND } from './photos.service';

const PHOTO: PhotoView = {
  id: 'p1',
  url: '/api/public/photos/p1',
  width: 1280,
  height: 854,
  bytes: 90_000,
};

@Component({
  imports: [PhotoUpload],
  template: `<app-photo-upload
    [current]="current()"
    (uploaded)="uploaded.push($event)"
  />`,
})
class Host {
  readonly current = signal<string | null>(null);
  readonly uploaded: PhotoView[] = [];
}

describe('PhotoUpload', () => {
  async function setup(current: string | null = null) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PHOTO_UPLOAD_BACKEND, useExisting: HttpBackend },
      ],
    });
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.current.set(current);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const choose = async (file: File) => {
      const input = el.querySelector<HTMLInputElement>('input[type=file]');
      if (!input) throw new Error('no file input');
      Object.defineProperty(input, 'files', {
        value: [file],
        configurable: true,
      });
      input.dispatchEvent(new Event('change'));
      await settle();
    };
    const image = () => el.querySelector('img')?.getAttribute('src') ?? null;
    const bar = () => el.querySelector('mat-progress-bar');
    return { http, fixture, el, settle, choose, image, bar };
  }

  const photoFile = (bytes = 1000, name = 'IMG_0001.HEIC') =>
    new File([new Uint8Array(bytes)], name, { type: 'image/heic' });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('accepts any image from the picker', async () => {
    const { el } = await setup();

    expect(el.querySelector('input[type=file]')?.getAttribute('accept')).toBe(
      'image/*',
    );
  });

  it('shows the saved photo it gets', async () => {
    const { image, el } = await setup('/api/public/photos/old');

    expect(image()).toBe('/api/public/photos/old');
    expect(el.querySelector('button')?.textContent).toContain('Zmień zdjęcie');
  });

  it('uploads the chosen file with a preview and progress, then emits the Photo', async () => {
    const { http, fixture, choose, settle, image, bar } = await setup();
    const file = photoFile();

    await choose(file);

    const req = http.expectOne({ url: '/api/photos', method: 'POST' });
    expect((req.request.body as FormData).get('file')).toBe(file);
    expect(req.request.reportProgress).toBe(true);
    expect(image()).toBe('blob:preview');
    expect(bar()?.getAttribute('aria-valuenow')).toBe('0');

    req.event({ type: HttpEventType.UploadProgress, loaded: 40, total: 100 });
    await settle();
    expect(bar()?.getAttribute('aria-valuenow')).toBe('40');

    req.flush(PHOTO);
    await settle();
    expect(fixture.componentInstance.uploaded).toEqual([PHOTO]);
    expect(image()).toBe(PHOTO.url);
    expect(bar()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('does not send a file over 10 MB', async () => {
    const { el, choose } = await setup();

    await choose(photoFile(PHOTO_MAX_BYTES + 1));

    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      PHOTO_TOO_LARGE,
    );
  });

  it('shows the message of the api and goes back to the saved photo', async () => {
    const { http, fixture, el, choose, settle, image, bar } = await setup(
      '/api/public/photos/old',
    );

    await choose(photoFile(1000, 'faktura.jpg'));
    http
      .expectOne('/api/photos')
      .flush(
        { message: PHOTO_UNSUPPORTED_TYPE, error: 'Unsupported Media Type' },
        { status: 415, statusText: 'Unsupported Media Type' },
      );
    await settle();

    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      PHOTO_UNSUPPORTED_TYPE,
    );
    expect(image()).toBe('/api/public/photos/old');
    expect(bar()).toBeNull();
    expect(fixture.componentInstance.uploaded).toEqual([]);
  });
});

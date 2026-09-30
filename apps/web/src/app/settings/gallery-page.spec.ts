import { CdkDragDrop } from '@angular/cdk/drag-drop';
import {
  HttpBackend,
  HttpEventType,
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import {
  GALLERY_FULL,
  GALLERY_MAX_PHOTOS,
  GalleryPhotoView,
  PHOTO_MAX_BYTES,
  PHOTO_TOO_LARGE,
} from '@bookit/shared';
import { of } from 'rxjs';
import { PHOTO_UPLOAD_BACKEND } from '../shared/photos.service';
import { DeleteGalleryPhotoDialog } from './delete-gallery-photo-dialog';
import { GalleryPage, photosCount } from './gallery-page';

const photo = (id: string): GalleryPhotoView => ({
  id,
  url: `/api/public/photos/${id}`,
  width: 1280,
  height: 854,
  bytes: 90_000,
});

const galleryOf = (count: number) =>
  Array.from({ length: count }, (_, i) => photo(`g${i}`));

const file = (name: string, bytes = 1000, type = 'image/jpeg') =>
  new File([new Uint8Array(bytes)], name, { type });

describe('GalleryPage', () => {
  async function setup(
    gallery: GalleryPhotoView[] = [photo('a'), photo('b')],
    closeWith?: unknown,
  ) {
    const open = vi.fn(() => ({ afterClosed: () => of(closeWith) }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PHOTO_UPLOAD_BACKEND, useExisting: HttpBackend },
        { provide: MatDialog, useValue: { open } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(GalleryPage);
    fixture.detectChanges();
    http.expectOne('/api/gallery').flush(gallery);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const page = fixture.componentInstance as unknown as {
      drop(event: Partial<CdkDragDrop<unknown>>): Promise<void>;
    };
    const choose = async (...files: File[]) => {
      const input = el.querySelector<HTMLInputElement>('input[type=file]');
      if (!input) throw new Error('no file input');
      Object.defineProperty(input, 'files', {
        value: files,
        configurable: true,
      });
      input.dispatchEvent(new Event('change'));
      await settle();
    };
    const tiles = () =>
      [...el.querySelectorAll('.tile img')].map((img) =>
        img.getAttribute('src'),
      );
    const uploads = () =>
      [...el.querySelectorAll('.uploads li')].map((li) =>
        [...li.querySelectorAll('.file, .state, .error')]
          .map((span) => span.textContent?.trim())
          .join(' '),
      );
    const pickButton = () =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes('Wybierz zdjęcia'),
      );
    const alerts = () =>
      [...el.querySelectorAll('[role=alert]')].map((a) =>
        a.textContent?.trim(),
      );
    /** Answers the upload of the file now being sent, then its `POST /api/gallery`. */
    const finish = async (id: string, progress?: number) => {
      const upload = http.expectOne({ url: '/api/photos', method: 'POST' });
      if (progress !== undefined) {
        upload.event({
          type: HttpEventType.UploadProgress,
          loaded: progress,
          total: 100,
        });
        await settle();
      }
      upload.flush(photo(id));
      await settle();
      const add = http.expectOne({ url: '/api/gallery', method: 'POST' });
      expect(add.request.body).toEqual({ photoId: id });
      add.flush(photo(id));
      await settle();
    };
    return {
      http,
      el,
      open,
      page,
      settle,
      choose,
      tiles,
      uploads,
      pickButton,
      alerts,
      finish,
    };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('shows the photos in order with the count', async () => {
    const { el, tiles } = await setup();

    expect(tiles()).toEqual(['/api/public/photos/a', '/api/public/photos/b']);
    expect(el.textContent).toContain(`2 z ${GALLERY_MAX_PHOTOS}`);
  });

  it('says the gallery is empty', async () => {
    const { el } = await setup([]);

    expect(el.textContent).toContain('Galeria jest pusta');
  });

  it('lets the picker choose many images', async () => {
    const { el } = await setup();

    const input = el.querySelector('input[type=file]');
    expect(input?.getAttribute('accept')).toBe('image/*');
    expect(input?.hasAttribute('multiple')).toBe(true);
  });

  it('uploads 5 files, a HEIC among them, one after another with the progress of each', async () => {
    const { http, choose, finish, uploads, tiles, settle } = await setup([]);

    await choose(
      file('IMG_0001.HEIC', 1000, 'image/heic'),
      file('2.jpg'),
      file('3.png', 1000, 'image/png'),
      file('4.webp', 1000, 'image/webp'),
      file('5.jpg'),
    );

    // Only the first file is sent; the rest wait.
    const first = http.expectOne('/api/photos');
    expect((first.request.body as FormData).get('file')).toMatchObject({
      name: 'IMG_0001.HEIC',
    });
    first.event({ type: HttpEventType.UploadProgress, loaded: 40, total: 100 });
    await settle();
    expect(uploads()).toEqual([
      'IMG_0001.HEIC 40%',
      '2.jpg czeka',
      '3.png czeka',
      '4.webp czeka',
      '5.jpg czeka',
    ]);
    first.flush(photo('p1'));
    await settle();
    http.expectOne({ url: '/api/gallery', method: 'POST' }).flush(photo('p1'));
    await settle();
    expect(uploads()[0]).toBe('2.jpg 0%');

    await finish('p2', 70);
    await finish('p3');
    await finish('p4');
    await finish('p5');

    expect(tiles()).toEqual(
      ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => `/api/public/photos/${id}`),
    );
    expect(uploads()).toEqual([]);
  });

  it('refuses a selection over the limit before sending anything', async () => {
    const { choose, alerts, pickButton } = await setup(
      galleryOf(GALLERY_MAX_PHOTOS - 2),
    );

    await choose(file('1.jpg'), file('2.jpg'), file('3.jpg'));

    expect(alerts()).toEqual([
      `${GALLERY_FULL}. Możesz dodać jeszcze 2 zdjęcia, a wybrano 3 zdjęcia.`,
    ]);
    expect(pickButton()?.disabled).toBe(false);
  });

  it('counts files still on their way against the limit', async () => {
    const { http, choose, alerts, pickButton, finish } = await setup(
      galleryOf(GALLERY_MAX_PHOTOS - 2),
    );

    await choose(file('1.jpg'), file('2.jpg'));
    expect(pickButton()?.disabled).toBe(true);
    await choose(file('3.jpg'));
    expect(alerts()).toEqual([GALLERY_FULL]);

    await finish('p1');
    await finish('p2');
    http.expectNone('/api/photos');
    expect(pickButton()?.disabled).toBe(true);
  });

  it('blocks the picker for a full gallery', async () => {
    const { el, pickButton } = await setup(galleryOf(GALLERY_MAX_PHOTOS));

    expect(pickButton()?.disabled).toBe(true);
    expect(el.textContent).toContain('galeria jest pełna');
  });

  it('does not send a file over 10 MB and goes on with the rest', async () => {
    const { choose, finish, uploads, tiles } = await setup([]);

    await choose(file('big.jpg', PHOTO_MAX_BYTES + 1), file('ok.jpg'));
    await finish('p1');

    expect(uploads()).toEqual([`big.jpg ${PHOTO_TOO_LARGE}`]);
    expect(tiles()).toEqual(['/api/public/photos/p1']);
  });

  it('deletes the uploaded Photo when the gallery refuses it, and fails the files still waiting', async () => {
    const { http, choose, settle, uploads, tiles } = await setup([]);

    await choose(file('1.jpg'), file('2.jpg'));
    http.expectOne('/api/photos').flush(photo('p1'));
    await settle();
    http
      .expectOne({ url: '/api/gallery', method: 'POST' })
      .flush(
        { message: GALLERY_FULL, error: 'Unprocessable Entity' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await settle();

    http
      .expectOne({ url: '/api/photos/p1', method: 'DELETE' })
      .flush(null, { status: 204, statusText: 'No Content' });
    http.expectNone('/api/photos');
    expect(uploads()).toEqual([
      `1.jpg ${GALLERY_FULL}`,
      `2.jpg ${GALLERY_FULL}`,
    ]);
    expect(tiles()).toEqual([]);
  });

  it('deletes a photo after the confirmation', async () => {
    const { http, el, open, settle, tiles } = await setup(undefined, true);

    el.querySelector<HTMLButtonElement>(
      'button[aria-label="Usuń zdjęcie 1"]',
    )?.click();
    await settle();

    expect(open).toHaveBeenCalledWith(DeleteGalleryPhotoDialog, {
      data: { url: '/api/public/photos/a' },
    });
    http
      .expectOne({ url: '/api/gallery/a', method: 'DELETE' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    expect(tiles()).toEqual(['/api/public/photos/b']);
  });

  it('keeps the photo when the deletion is cancelled', async () => {
    const { http, el, settle, tiles } = await setup(undefined, false);

    el.querySelector<HTMLButtonElement>(
      'button[aria-label="Usuń zdjęcie 1"]',
    )?.click();
    await settle();

    http.expectNone('/api/gallery/a');
    expect(tiles()).toHaveLength(2);
  });

  it('saves the order after a drag and puts it back when the save fails', async () => {
    const { http, page, settle, tiles, alerts } = await setup([
      photo('a'),
      photo('b'),
      photo('c'),
    ]);

    const saved = page.drop({ previousIndex: 2, currentIndex: 0 });
    await settle();
    expect(tiles()).toEqual(
      ['c', 'a', 'b'].map((id) => `/api/public/photos/${id}`),
    );
    const put = http.expectOne({ url: '/api/gallery/order', method: 'PUT' });
    expect(put.request.body).toEqual({ photoIds: ['c', 'a', 'b'] });
    put.flush(
      { message: 'Lista się nie zgadza', error: 'Bad Request' },
      { status: 400, statusText: 'Bad Request' },
    );
    await saved;
    await settle();

    expect(tiles()).toEqual(
      ['a', 'b', 'c'].map((id) => `/api/public/photos/${id}`),
    );
    expect(alerts()).toEqual(['Lista się nie zgadza']);
  });
});

describe('photosCount', () => {
  it.each([
    [1, '1 zdjęcie'],
    [2, '2 zdjęcia'],
    [4, '4 zdjęcia'],
    [5, '5 zdjęć'],
    [12, '12 zdjęć'],
    [22, '22 zdjęcia'],
    [25, '25 zdjęć'],
  ])('%i → %s', (count, text) => {
    expect(photosCount(count)).toBe(text);
  });
});

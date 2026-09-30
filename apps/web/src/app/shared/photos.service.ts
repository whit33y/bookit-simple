import { XhrFactory } from '@angular/common';
import {
  HttpBackend,
  HttpClient,
  HttpEventType,
  HttpXhrBackend,
} from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { PhotoView } from '@bookit/shared';
import { filter, map, Observable } from 'rxjs';

/**
 * The app sends requests with `fetch`, which cannot report upload progress, so uploads
 * go through `XMLHttpRequest`. Tests put `HttpClientTestingBackend` here.
 */
export const PHOTO_UPLOAD_BACKEND = new InjectionToken<HttpBackend>(
  'PHOTO_UPLOAD_BACKEND',
  {
    providedIn: 'root',
    factory: () => new HttpXhrBackend(inject(XhrFactory)),
  },
);

/** While a Photo uploads: the share sent so far (0 to 1), then the saved Photo. */
export type PhotoUploadEvent = { progress: number } | { photo: PhotoView };

/** `POST /api/photos`, only for the Właściciel. */
@Injectable({ providedIn: 'root' })
export class PhotosService {
  private readonly xhr = new HttpClient(inject(PHOTO_UPLOAD_BACKEND));

  /** `413` over 10 MB, `415` for a file that is not a photo. */
  upload(file: File): Observable<PhotoUploadEvent> {
    const body = new FormData();
    body.append('file', file);
    return this.xhr
      .post<PhotoView>('/api/photos', body, {
        observe: 'events',
        reportProgress: true,
      })
      .pipe(
        map((event): PhotoUploadEvent | null => {
          if (event.type === HttpEventType.UploadProgress) {
            return { progress: event.total ? event.loaded / event.total : 0 };
          }
          if (event.type === HttpEventType.Response && event.body) {
            return { photo: event.body };
          }
          return null;
        }),
        filter((event) => event !== null),
      );
  }
}

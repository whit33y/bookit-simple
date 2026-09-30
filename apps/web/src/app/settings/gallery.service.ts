import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  AddGalleryPhotoRequest,
  GalleryOrderRequest,
  GalleryPhotoView,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';

const URL = '/api/gallery';

/** The gallery endpoints, only for the Właściciel. */
@Injectable({ providedIn: 'root' })
export class GalleryService {
  private readonly http = inject(HttpClient);

  list(): Promise<GalleryPhotoView[]> {
    return firstValueFrom(this.http.get<GalleryPhotoView[]>(URL));
  }

  /** A Photo from `POST /api/photos`, at the end; `422` when the gallery is full. */
  add(photoId: string): Promise<GalleryPhotoView> {
    const body: AddGalleryPhotoRequest = { photoId };
    return firstValueFrom(this.http.post<GalleryPhotoView>(URL, body));
  }

  /** Deletes the Photo too. */
  remove(photoId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${URL}/${photoId}`));
  }

  /** Every Photo of the gallery, in the new order. */
  reorder(photoIds: string[]): Promise<void> {
    const body: GalleryOrderRequest = { photoIds };
    return firstValueFrom(this.http.put<void>(`${URL}/order`, body));
  }
}

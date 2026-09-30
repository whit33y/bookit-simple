import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  AnnouncementView,
  CreateAnnouncementRequest,
  UpdateAnnouncementRequest,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';

const URL = '/api/announcements';

/** The Ogłoszenia endpoints, only for the Właściciel. */
@Injectable({ providedIn: 'root' })
export class AnnouncementsService {
  private readonly http = inject(HttpClient);

  /** All of them, newest `showFrom` first. */
  list(): Promise<AnnouncementView[]> {
    return firstValueFrom(this.http.get<AnnouncementView[]>(URL));
  }

  /** `422` when `showUntil` is before `showFrom`. */
  create(body: CreateAnnouncementRequest): Promise<AnnouncementView> {
    return firstValueFrom(this.http.post<AnnouncementView>(URL, body));
  }

  update(
    id: string,
    body: UpdateAnnouncementRequest,
  ): Promise<AnnouncementView> {
    return firstValueFrom(
      this.http.patch<AnnouncementView>(`${URL}/${id}`, body),
    );
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${URL}/${id}`));
  }
}

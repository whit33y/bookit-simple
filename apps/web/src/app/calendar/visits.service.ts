import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CreateVisitRequest,
  RestoreVisitRequest,
  UpdateVisitRequest,
  VisitView,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';

const URL = '/api/visits';

/**
 * The Wizyty endpoints, for the whole Personel. A save that makes a Kolizja answers
 * `409` (`VisitCollisionResponse`) unless it has `acceptCollisions`.
 */
@Injectable({ providedIn: 'root' })
export class VisitsService {
  private readonly http = inject(HttpClient);

  create(body: CreateVisitRequest): Promise<VisitView> {
    return firstValueFrom(this.http.post<VisitView>(URL, body));
  }

  update(id: string, body: UpdateVisitRequest): Promise<VisitView> {
    return firstValueFrom(this.http.patch<VisitView>(`${URL}/${id}`, body));
  }

  cancel(id: string): Promise<VisitView> {
    return firstValueFrom(this.http.post<VisitView>(`${URL}/${id}/cancel`, {}));
  }

  noShow(id: string): Promise<VisitView> {
    return firstValueFrom(
      this.http.post<VisitView>(`${URL}/${id}/no-show`, {}),
    );
  }

  /** Back to Zaplanowana; checks Kolizje. */
  restore(id: string, acceptCollisions = false): Promise<VisitView> {
    const body: RestoreVisitRequest = acceptCollisions
      ? { acceptCollisions }
      : {};
    return firstValueFrom(
      this.http.post<VisitView>(`${URL}/${id}/restore`, body),
    );
  }

  /** For a Wizyta entered by mistake; the Historia zmian keeps it. */
  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${URL}/${id}`));
  }
}

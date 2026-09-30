import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  VisitChangePage,
  VisitChangeQuery,
  VisitChangeView,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';

/** The Historia zmian endpoints, only for the Właściciel. */
@Injectable({ providedIn: 'root' })
export class VisitChangesService {
  private readonly http = inject(HttpClient);

  /** Filters left out or empty are not sent. */
  list(query: VisitChangeQuery): Promise<VisitChangePage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return firstValueFrom(
      this.http.get<VisitChangePage>('/api/visit-changes', { params }),
    );
  }

  /** For the Historia tab of the Wizyta card (#30). */
  forVisit(visitId: string): Promise<VisitChangeView[]> {
    return firstValueFrom(
      this.http.get<VisitChangeView[]>(`/api/visits/${visitId}/changes`),
    );
  }
}

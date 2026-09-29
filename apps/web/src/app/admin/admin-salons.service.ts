import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CreateSalonRequest,
  CreateSalonResponse,
  SlugAvailabilityResponse,
} from '@bookit/shared';
import { firstValueFrom, Observable } from 'rxjs';

/** The Administrator's endpoints for Salons. */
@Injectable({ providedIn: 'root' })
export class AdminSalonsService {
  private readonly http = inject(HttpClient);

  slugAvailability(slug: string): Observable<SlugAvailabilityResponse> {
    return this.http.get<SlugAvailabilityResponse>(
      '/api/admin/salons/slug-available',
      { params: { slug } },
    );
  }

  create(body: CreateSalonRequest): Promise<CreateSalonResponse> {
    return firstValueFrom(
      this.http.post<CreateSalonResponse>('/api/admin/salons', body),
    );
  }
}

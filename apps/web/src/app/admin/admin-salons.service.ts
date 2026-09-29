import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  AdminSalonDetails,
  AdminSalonSummary,
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

  list(): Promise<AdminSalonSummary[]> {
    return firstValueFrom(
      this.http.get<AdminSalonSummary[]>('/api/admin/salons'),
    );
  }

  details(id: string): Promise<AdminSalonDetails> {
    return firstValueFrom(
      this.http.get<AdminSalonDetails>(`/api/admin/salons/${id}`),
    );
  }

  /** Also logs the Personel of the Salon out. */
  suspend(id: string): Promise<AdminSalonDetails> {
    return firstValueFrom(
      this.http.post<AdminSalonDetails>(`/api/admin/salons/${id}/suspend`, {}),
    );
  }

  resume(id: string): Promise<AdminSalonDetails> {
    return firstValueFrom(
      this.http.post<AdminSalonDetails>(`/api/admin/salons/${id}/resume`, {}),
    );
  }

  resendInvitation(id: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`/api/admin/salons/${id}/resend-invitation`, {}),
    );
  }
}

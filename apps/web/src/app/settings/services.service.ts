import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CreateServiceRequest,
  ServiceOrderRequest,
  ServiceView,
  UpdateServiceRequest,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';

const URL = '/api/services';

/** The Usługi endpoints; all but `list` only for the Właściciel. */
@Injectable({ providedIn: 'root' })
export class ServicesService {
  private readonly http = inject(HttpClient);

  /** The Cennik screen takes archived Usługi too; picking Usługi for a Wizyta does not. */
  list({ includeArchived = false } = {}): Promise<ServiceView[]> {
    return firstValueFrom(
      this.http.get<ServiceView[]>(URL, {
        params: includeArchived ? { includeArchived: 'true' } : {},
      }),
    );
  }

  create(body: CreateServiceRequest): Promise<ServiceView> {
    return firstValueFrom(this.http.post<ServiceView>(URL, body));
  }

  update(id: string, body: UpdateServiceRequest): Promise<ServiceView> {
    return firstValueFrom(this.http.patch<ServiceView>(`${URL}/${id}`, body));
  }

  archive(id: string): Promise<ServiceView> {
    return firstValueFrom(
      this.http.post<ServiceView>(`${URL}/${id}/archive`, null),
    );
  }

  /** `409` when the name is taken in the Kategoria meanwhile. */
  unarchive(id: string): Promise<ServiceView> {
    return firstValueFrom(
      this.http.post<ServiceView>(`${URL}/${id}/unarchive`, null),
    );
  }

  /** Every Usługa of the Kategoria that is not archived, in the new order. */
  reorder(categoryId: string, ids: string[]): Promise<void> {
    const body: ServiceOrderRequest = { categoryId, ids };
    return firstValueFrom(this.http.put<void>(`${URL}/order`, body));
  }
}

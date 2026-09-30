import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CreateServiceCategoryRequest,
  ServiceCategoryOrderRequest,
  ServiceCategoryView,
  UpdateServiceCategoryRequest,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';

const URL = '/api/service-categories';

/** The Kategorie Usług endpoints; all but `list` only for the Właściciel. */
@Injectable({ providedIn: 'root' })
export class ServiceCategoriesService {
  private readonly http = inject(HttpClient);

  list(): Promise<ServiceCategoryView[]> {
    return firstValueFrom(this.http.get<ServiceCategoryView[]>(URL));
  }

  create(body: CreateServiceCategoryRequest): Promise<ServiceCategoryView> {
    return firstValueFrom(this.http.post<ServiceCategoryView>(URL, body));
  }

  rename(
    id: string,
    body: UpdateServiceCategoryRequest,
  ): Promise<ServiceCategoryView> {
    return firstValueFrom(
      this.http.patch<ServiceCategoryView>(`${URL}/${id}`, body),
    );
  }

  /** `409` while the Kategoria has Usługi. */
  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${URL}/${id}`));
  }

  /** Every Kategoria, in the new order. */
  reorder(ids: string[]): Promise<void> {
    const body: ServiceCategoryOrderRequest = { ids };
    return firstValueFrom(this.http.put<void>(`${URL}/order`, body));
  }
}

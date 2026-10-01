import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ClientView,
  ClientVisitPage,
  CreateClientRequest,
  UpdateClientRequest,
} from '@bookit/shared';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
  map,
  merge,
  Observable,
  of,
  skip,
  switchMap,
  take,
} from 'rxjs';
import { errorMessage } from '../shared/error-message';

const URL = '/api/clients';

/** How long typing has to stop before a search goes out. */
export const CLIENT_SEARCH_DEBOUNCE_MS = 250;

/** What a search while typing ends with: the Klienci found or what to show instead. */
export type ClientSearchResult = { query: string } & (
  | { clients: ClientView[]; error?: undefined }
  | { error: string; clients?: undefined }
);

/** The Kartoteka Klientów endpoints, for the whole Personel; delete only for the Właściciel. */
@Injectable({ providedIn: 'root' })
export class ClientsService {
  private readonly http = inject(HttpClient);

  /**
   * Searches for the first query at once and for later ones when typing stops. The answer
   * to an older query is dropped once a newer one goes out, so a slow reply cannot
   * overwrite the list.
   */
  searchWhileTyping(
    queries: Observable<string>,
  ): Observable<ClientSearchResult> {
    const trimmed = queries.pipe(map((q) => q.trim()));
    return merge(
      trimmed.pipe(take(1)),
      trimmed.pipe(skip(1), debounceTime(CLIENT_SEARCH_DEBOUNCE_MS)),
    ).pipe(
      distinctUntilChanged(),
      switchMap((q) =>
        this.http.get<ClientView[]>(URL, { params: q ? { q } : {} }).pipe(
          map((clients): ClientSearchResult => ({ query: q, clients })),
          catchError((error: unknown) =>
            of({ query: q, error: errorMessage(error) }),
          ),
        ),
      ),
    );
  }

  /** `404` for a deleted Klient. */
  get(id: string): Promise<ClientView> {
    return firstValueFrom(this.http.get<ClientView>(`${URL}/${id}`));
  }

  /** The karta Klienta: every Wizyta, newest first; `page` counts from 1. */
  visits(id: string, page: number): Promise<ClientVisitPage> {
    return firstValueFrom(
      this.http.get<ClientVisitPage>(`${URL}/${id}/visits`, {
        params: { page },
      }),
    );
  }

  /** `422` for an invalid phone, `409` (`ClientPhoneTakenResponse`) for a taken one. */
  create(body: CreateClientRequest): Promise<ClientView> {
    return firstValueFrom(this.http.post<ClientView>(URL, body));
  }

  /** `422` for an invalid phone, `409` (`ClientPhoneTakenResponse`) for a taken one. */
  update(id: string, body: UpdateClientRequest): Promise<ClientView> {
    return firstValueFrom(this.http.patch<ClientView>(`${URL}/${id}`, body));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${URL}/${id}`));
  }
}

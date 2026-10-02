import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  AbsenceView,
  CreateAbsenceRequest,
  UpdateAbsenceRequest,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';

const URL = '/api/absences';

/** The Nieobecności endpoints, for the whole Personel. */
@Injectable({ providedIn: 'root' })
export class AbsencesService {
  private readonly http = inject(HttpClient);

  create(body: CreateAbsenceRequest): Promise<AbsenceView> {
    return firstValueFrom(this.http.post<AbsenceView>(URL, body));
  }

  update(id: string, body: UpdateAbsenceRequest): Promise<AbsenceView> {
    return firstValueFrom(this.http.patch<AbsenceView>(`${URL}/${id}`, body));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${URL}/${id}`));
  }
}

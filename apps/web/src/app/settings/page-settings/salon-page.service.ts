import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { SalonPageSettings, UpdateSalonPageRequest } from '@bookit/shared';
import { firstValueFrom } from 'rxjs';

const URL = '/api/salon/page';

/** The content of the Wizytówka, only for the Właściciel. */
@Injectable({ providedIn: 'root' })
export class SalonPageService {
  private readonly http = inject(HttpClient);

  get(): Promise<SalonPageSettings> {
    return firstValueFrom(this.http.get<SalonPageSettings>(URL));
  }

  /** `422` with the reason for an invalid value, e.g. a map link without `https://`. */
  save(changes: UpdateSalonPageRequest): Promise<SalonPageSettings> {
    return firstValueFrom(this.http.patch<SalonPageSettings>(URL, changes));
  }
}

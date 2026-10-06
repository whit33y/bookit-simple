import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { OpeningHoursDay } from '@bookit/shared';
import { firstValueFrom } from 'rxjs';

const URL = '/api/opening-hours';

/** The Godziny otwarcia endpoints, only for the Właściciel. */
@Injectable({ providedIn: 'root' })
export class OpeningHoursService {
  private readonly http = inject(HttpClient);

  /** Open weekdays only. */
  get(): Promise<OpeningHoursDay[]> {
    return firstValueFrom(this.http.get<OpeningHoursDay[]>(URL));
  }

  /** The whole week; a weekday left out is closed. `422` when a day closes before it opens. */
  save(days: OpeningHoursDay[]): Promise<OpeningHoursDay[]> {
    return firstValueFrom(this.http.put<OpeningHoursDay[]>(URL, days));
  }
}

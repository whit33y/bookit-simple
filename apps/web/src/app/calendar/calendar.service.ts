import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { CalendarDay, CalendarResponse } from '@bookit/shared';
import { firstValueFrom } from 'rxjs';

/** `GET /api/calendar`, for the whole Personel. */
@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly http = inject(HttpClient);

  /** Everything to draw the days from `from` to `to`, both included. */
  get(from: CalendarDay, to: CalendarDay): Promise<CalendarResponse> {
    return firstValueFrom(
      this.http.get<CalendarResponse>('/api/calendar', {
        params: { from, to },
      }),
    );
  }
}

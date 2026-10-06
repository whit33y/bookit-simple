import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  InviteStaffRequest,
  StaffDeletionPreview,
  StaffMemberView,
  StaffOrderRequest,
  UpdateStaffRequest,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';

/** The Personel endpoints; all but `list` only for the Właściciel. */
@Injectable({ providedIn: 'root' })
export class StaffService {
  private readonly http = inject(HttpClient);

  list(): Promise<StaffMemberView[]> {
    return firstValueFrom(this.http.get<StaffMemberView[]>('/api/staff'));
  }

  invite(body: InviteStaffRequest): Promise<StaffMemberView> {
    return firstValueFrom(
      this.http.post<StaffMemberView>('/api/staff/invite', body),
    );
  }

  update(id: string, body: UpdateStaffRequest): Promise<StaffMemberView> {
    return firstValueFrom(
      this.http.patch<StaffMemberView>(`/api/staff/${id}`, body),
    );
  }

  /** Every person of the Personel, in the new order. */
  reorder(ids: string[]): Promise<void> {
    const body: StaffOrderRequest = { ids };
    return firstValueFrom(this.http.put<void>('/api/staff/order', body));
  }

  deletionPreview(id: string): Promise<StaffDeletionPreview> {
    return firstValueFrom(
      this.http.get<StaffDeletionPreview>(`/api/staff/${id}/deletion-preview`),
    );
  }

  /** With `keepVisits`, her Wizyty stay under her name. */
  remove(id: string, keepVisits: boolean): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`/api/staff/${id}`, {
        params: { keepVisits },
      }),
    );
  }

  resendInvitation(id: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`/api/staff/${id}/resend-invitation`, {}),
    );
  }
}

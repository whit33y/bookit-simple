import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  InviteStaffRequest,
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

  resendInvitation(id: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`/api/staff/${id}/resend-invitation`, {}),
    );
  }
}

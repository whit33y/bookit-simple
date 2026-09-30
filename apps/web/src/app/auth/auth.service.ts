import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  AcceptInvitationRequest,
  ConfirmPasswordResetRequest,
  InvitationResponse,
  LoginRequest,
  MeResponse,
  PasswordResetRequest,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';

/** Who is logged in, as a signal, and the auth endpoints of the API. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly meState = signal<MeResponse | null>(null);
  private loading: Promise<MeResponse | null> | null = null;

  /** The logged-in person, `null` without a session (or before `ensureLoaded`). */
  readonly me = this.meState.asReadonly();

  /** Asks the API who is logged in, once; later calls reuse the answer. */
  ensureLoaded(): Promise<MeResponse | null> {
    this.loading ??= firstValueFrom(
      this.http.get<MeResponse>('/api/auth/me'),
    ).then(
      (me) => this.setMe(me),
      (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          return this.setMe(null);
        }
        // Let the next navigation try again.
        this.loading = null;
        throw error;
      },
    );
    return this.loading;
  }

  /** Asks the API again, e.g. after the person changed their own role. */
  refresh(): Promise<MeResponse | null> {
    this.loading = null;
    return this.ensureLoaded();
  }

  async login(email: string, password: string): Promise<MeResponse> {
    const body: LoginRequest = { email, password };
    return this.loggedIn(
      await firstValueFrom(this.http.post<MeResponse>('/api/auth/login', body)),
    );
  }

  /** Forgets the person here even if the request fails, so the browser never looks logged in. */
  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>('/api/auth/logout', null));
    } finally {
      this.loading = Promise.resolve(this.setMe(null));
    }
  }

  describeInvitation(token: string): Promise<InvitationResponse> {
    return firstValueFrom(
      this.http.get<InvitationResponse>(
        `/api/auth/invitations/${encodeURIComponent(token)}`,
      ),
    );
  }

  /** Sets the password from an invitation; the API logs the person in. */
  async acceptInvitation(token: string, password: string): Promise<MeResponse> {
    const body: AcceptInvitationRequest = { token, password };
    return this.loggedIn(
      await firstValueFrom(
        this.http.post<MeResponse>('/api/auth/accept-invitation', body),
      ),
    );
  }

  requestPasswordReset(email: string): Promise<void> {
    const body: PasswordResetRequest = { email };
    return firstValueFrom(
      this.http.post<void>('/api/auth/password-reset', body),
    );
  }

  /** Sets a new password from the e-mail link. The person logs in again afterwards. */
  confirmPasswordReset(token: string, password: string): Promise<void> {
    const body: ConfirmPasswordResetRequest = { token, password };
    return firstValueFrom(
      this.http.post<void>('/api/auth/password-reset/confirm', body),
    );
  }

  /**
   * Where a person lands after logging in. Someone who is neither the Administrator nor
   * in a Personel has nowhere to go and stays on the login page.
   */
  homeUrl(me: MeResponse): string {
    if (me.user.isAdministrator) return '/admin';
    return me.role ? '/panel' : '/logowanie';
  }

  private loggedIn(me: MeResponse): MeResponse {
    this.loading = Promise.resolve(this.setMe(me));
    return me;
  }

  private setMe(me: MeResponse | null): MeResponse | null {
    this.meState.set(me);
    return me;
  }
}

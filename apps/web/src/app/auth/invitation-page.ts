import { Component, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { InvitationResponse } from '@bookit/shared';
import { errorMessage } from '../shared/error-message';
import { AuthCard } from './auth-card';
import { AuthService } from './auth.service';
import { NewPasswordForm } from './new-password-form';

/** `/zaproszenie/:token`: the invited person sets a password and lands in the panel. */
@Component({
  selector: 'app-invitation-page',
  imports: [
    AuthCard,
    MatButtonModule,
    MatProgressSpinnerModule,
    NewPasswordForm,
    RouterLink,
  ],
  template: `
    @if (invitation(); as invitation) {
      <app-auth-card
        [heading]="invitation.salonName"
        subheading="Zaproszenie do Salonu"
      >
        <p>
          Cześć {{ invitation.displayName }}! Ustaw hasło, którym będziesz
          logować się do panelu Salonu.
        </p>
        <app-new-password-form
          submitLabel="Ustaw hasło"
          [pending]="pending()"
          [error]="error()"
          (submitted)="accept($event)"
        />
      </app-auth-card>
    } @else if (loadError(); as message) {
      <app-auth-card heading="Zaproszenie">
        <p class="error" role="alert">{{ message }}</p>
        <p>Poproś osobę, która Cię zaprosiła, o wysłanie nowego zaproszenia.</p>
        <div class="actions">
          <span></span>
          <a mat-flat-button routerLink="/logowanie">Przejdź do logowania</a>
        </div>
      </app-auth-card>
    } @else {
      <app-auth-card heading="Zaproszenie">
        <mat-spinner diameter="32" aria-label="Wczytywanie" />
      </app-auth-card>
    }
  `,
  styleUrl: './auth-form.scss',
})
export class InvitationPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly token = input.required<string>();

  protected readonly invitation = signal<InvitationResponse | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.invitation.set(await this.auth.describeInvitation(this.token()));
    } catch (error) {
      this.loadError.set(errorMessage(error));
    }
  }

  protected async accept(password: string): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    this.error.set(null);
    try {
      const me = await this.auth.acceptInvitation(this.token(), password);
      await this.router.navigateByUrl(this.auth.homeUrl(me));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}

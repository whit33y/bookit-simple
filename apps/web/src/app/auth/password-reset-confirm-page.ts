import { Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../shared/error-message';
import { AuthCard } from './auth-card';
import { AuthService } from './auth.service';
import { NewPasswordForm } from './new-password-form';

/** `/reset-hasla/:token`: sets a new password from the e-mail link. */
@Component({
  selector: 'app-password-reset-confirm-page',
  imports: [AuthCard, MatButtonModule, NewPasswordForm, RouterLink],
  template: `
    <app-auth-card heading="Ustaw nowe hasło">
      <app-new-password-form
        submitLabel="Zapisz hasło"
        [pending]="pending()"
        [error]="error()"
        (submitted)="confirm($event)"
      >
        <a mat-button routerLink="/reset-hasla">Wyślij nowy link</a>
      </app-new-password-form>
    </app-auth-card>
  `,
  styleUrl: './auth-form.scss',
})
export class PasswordResetConfirmPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly token = input.required<string>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async confirm(password: string): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    this.error.set(null);
    try {
      await this.auth.confirmPasswordReset(this.token(), password);
      await this.router.navigateByUrl('/logowanie?reset=ok');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}

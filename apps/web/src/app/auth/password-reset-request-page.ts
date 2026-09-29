import { Component, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { errorMessage } from '../shared/error-message';
import { AuthCard } from './auth-card';
import { AuthService } from './auth.service';

/** `/reset-hasla`: asks for a link to set a new password. */
@Component({
  selector: 'app-password-reset-request-page',
  imports: [
    AuthCard,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  template: `
    <app-auth-card heading="Nie pamiętasz hasła?">
      @if (sentTo(); as email) {
        <p class="info" role="status">
          Jeśli konto z adresem {{ email }} istnieje, wysłaliśmy na nie link do
          ustawienia nowego hasła. Link jest ważny przez godzinę.
        </p>
        <div class="actions">
          <span></span>
          <a mat-flat-button routerLink="/logowanie">Wróć do logowania</a>
        </div>
      } @else {
        <p>Podaj e-mail, którym logujesz się do Bookit. Wyślemy na niego link do ustawienia nowego hasła.</p>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field appearance="outline">
            <mat-label>E-mail</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="email" />
            @if (form.controls.email.hasError('required')) {
              <mat-error>Wpisz e-mail</mat-error>
            }
          </mat-form-field>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <div class="actions">
            <a mat-button routerLink="/logowanie">Wróć do logowania</a>
            <button mat-flat-button type="submit" [disabled]="pending()">
              Wyślij link
            </button>
          </div>
        </form>
      }
    </app-auth-card>
  `,
  styleUrl: './auth-form.scss',
})
export class PasswordResetRequestPage {
  private readonly auth = inject(AuthService);

  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sentTo = signal<string | null>(null);

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.pending()) return;
    this.pending.set(true);
    this.error.set(null);
    try {
      const email = this.form.controls.email.value.trim();
      await this.auth.requestPasswordReset(email);
      this.sentTo.set(email);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}

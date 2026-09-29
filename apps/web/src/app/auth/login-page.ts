import { Component, inject, input, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../shared/error-message';
import { AuthCard } from './auth-card';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login-page',
  imports: [
    AuthCard,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  template: `
    <app-auth-card heading="Bookit" subheading="Zaloguj się do panelu Salonu">
      @if (reset() === 'ok') {
        <p class="info" role="status">
          Hasło zostało zmienione. Zaloguj się nowym hasłem.
        </p>
      }
      <form [formGroup]="form" (ngSubmit)="submit()">
        <mat-form-field appearance="outline">
          <mat-label>E-mail</mat-label>
          <input matInput type="email" formControlName="email" autocomplete="email" />
          @if (form.controls.email.hasError('required')) {
            <mat-error>Wpisz e-mail</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Hasło</mat-label>
          <input
            matInput
            [type]="visible() ? 'text' : 'password'"
            formControlName="password"
            autocomplete="current-password"
          />
          <button
            mat-icon-button
            matSuffix
            type="button"
            (click)="visible.set(!visible())"
            [attr.aria-label]="visible() ? 'Ukryj hasło' : 'Pokaż hasło'"
          >
            <mat-icon>{{ visible() ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
          @if (form.controls.password.hasError('required')) {
            <mat-error>Wpisz hasło</mat-error>
          }
        </mat-form-field>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <div class="actions">
          <a mat-button routerLink="/reset-hasla">Nie pamiętasz hasła?</a>
          <button mat-flat-button type="submit" [disabled]="pending()">
            Zaloguj się
          </button>
        </div>
      </form>
    </app-auth-card>
  `,
  styleUrl: './auth-form.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** `?reset=ok` after setting a new password from the e-mail link. */
  readonly reset = input<string>();

  protected readonly visible = signal(false);
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.pending()) return;
    this.pending.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      const me = await this.auth.login(email.trim(), password);
      await this.router.navigateByUrl(this.auth.homeUrl(me));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}

import { Component, input, output, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from '@bookit/shared';

export const PASSWORDS_DIFFER = 'Hasła nie są takie same';

function samePasswords(group: AbstractControl): ValidationErrors | null {
  const { password, repeat } = group.value as { password: string; repeat: string };
  return repeat && password !== repeat ? { differ: true } : null;
}

/**
 * A new password typed twice, for the invitation and the password reset. Projected
 * content (e.g. a link) goes next to the submit button.
 */
@Component({
  selector: 'app-new-password-form',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-form-field appearance="outline">
        <mat-label>Nowe hasło</mat-label>
        <input
          matInput
          [type]="visible() ? 'text' : 'password'"
          formControlName="password"
          autocomplete="new-password"
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
        <mat-hint>Co najmniej {{ minLength }} znaków</mat-hint>
        @if (form.controls.password.hasError('required')) {
          <mat-error>Wpisz hasło</mat-error>
        } @else if (form.controls.password.hasError('minlength')) {
          <mat-error>{{ tooShort }}</mat-error>
        }
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Powtórz hasło</mat-label>
        <input
          matInput
          [type]="visible() ? 'text' : 'password'"
          formControlName="repeat"
          autocomplete="new-password"
        />
        @if (form.controls.repeat.hasError('required')) {
          <mat-error>Powtórz hasło</mat-error>
        }
      </mat-form-field>
      @if (form.hasError('differ') && form.controls.repeat.touched) {
        <p class="error" role="alert">{{ differ }}</p>
      }
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <span><ng-content /></span>
        <button mat-flat-button type="submit" [disabled]="pending()">
          {{ submitLabel() }}
        </button>
      </div>
    </form>
  `,
  styleUrl: './auth-form.scss',
})
export class NewPasswordForm {
  readonly submitLabel = input.required<string>();
  readonly pending = input(false);
  readonly error = input<string | null>(null);
  readonly submitted = output<string>();

  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected readonly tooShort = PASSWORD_TOO_SHORT;
  protected readonly differ = PASSWORDS_DIFFER;
  protected readonly visible = signal(false);
  protected readonly form = new FormGroup(
    {
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)],
      }),
      repeat: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: samePasswords },
  );

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.submitted.emit(this.form.controls.password.value);
  }
}

import { Component, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  STAFF_BIO_MAX_LENGTH,
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  StaffMemberView,
  StaffRole,
  UpdateStaffRequest,
} from '@bookit/shared';
import { errorMessage } from '../shared/error-message';
import { StaffService } from './staff.service';

/**
 * Edits one person of the Personel and saves it itself, so an error such as the last
 * Właściciel losing the role shows in the dialog. Closes with the saved person.
 * The photo field comes with the photo upload (#19).
 */
@Component({
  selector: 'app-edit-staff-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ member.displayName }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <mat-form-field appearance="outline">
          <mat-label>Imię</mat-label>
          <input matInput formControlName="displayName" autocomplete="off" />
          @if (form.controls.displayName.hasError('required')) {
            <mat-error>Wpisz imię</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Rola</mat-label>
          <mat-select formControlName="role">
            @for (role of roles; track role) {
              <mat-option [value]="role">{{ roleLabels[role] }}</mat-option>
            }
          </mat-select>
          <mat-hint>Właściciel ma też dostęp do Ustawień</mat-hint>
        </mat-form-field>
        <mat-slide-toggle formControlName="acceptsVisits">
          Przyjmuje Wizyty
        </mat-slide-toggle>
        <p class="hint">Ma własną kolumnę w kalendarzu.</p>
        <mat-slide-toggle formControlName="showOnPage">
          Pokazuj na Wizytówce
        </mat-slide-toggle>
        <p class="hint">W sekcji Zespół, z opisem poniżej.</p>
        <mat-form-field appearance="outline">
          <mat-label>Opis</mat-label>
          <textarea
            matInput
            formControlName="bio"
            rows="3"
            [maxlength]="bioMax"
          ></textarea>
          <mat-hint align="end"
            >{{ form.controls.bio.value.length }} / {{ bioMax }}</mat-hint
          >
        </mat-form-field>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Anuluj</button>
        <button mat-flat-button type="submit" [disabled]="pending()">
          Zapisz
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      display: flex;
      flex-direction: column;
      min-width: min(420px, 80vw);
    }
    mat-form-field {
      width: 100%;
      margin-bottom: 12px;
    }
    .hint {
      margin: 0 0 16px 52px;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
      margin: 8px 0 0;
    }
  `,
})
export class EditStaffDialog {
  private readonly api = inject(StaffService);
  private readonly ref =
    inject<MatDialogRef<EditStaffDialog, StaffMemberView>>(MatDialogRef);
  protected readonly member = inject<StaffMemberView>(MAT_DIALOG_DATA);

  protected readonly roles = STAFF_ROLES;
  protected readonly roleLabels = STAFF_ROLE_LABELS;
  protected readonly bioMax = STAFF_BIO_MAX_LENGTH;

  protected readonly form = new FormGroup({
    displayName: new FormControl(this.member.displayName, {
      nonNullable: true,
      validators: Validators.required,
    }),
    role: new FormControl<StaffRole>(this.member.role, { nonNullable: true }),
    acceptsVisits: new FormControl(this.member.acceptsVisits, {
      nonNullable: true,
    }),
    showOnPage: new FormControl(this.member.showOnPage, { nonNullable: true }),
    bio: new FormControl(this.member.bio ?? '', { nonNullable: true }),
  });

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async save(): Promise<void> {
    if (this.pending()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const fields = this.form.getRawValue();
    const body: UpdateStaffRequest = {
      displayName: fields.displayName.trim(),
      role: fields.role,
      acceptsVisits: fields.acceptsVisits,
      showOnPage: fields.showOnPage,
      bio: fields.bio.trim() || null,
    };
    this.pending.set(true);
    this.error.set(null);
    try {
      this.ref.close(await this.api.update(this.member.id, body));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}

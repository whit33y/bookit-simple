import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  CLIENT_NAME_MAX_LENGTH,
  CLIENT_NAME_REQUIRED,
  CLIENT_NAME_TOO_LONG,
  CLIENT_NOTES_HINT,
  CLIENT_NOTES_MAX_LENGTH,
  CLIENT_PHONE_TAKEN,
  ClientPhoneTakenResponse,
  ClientView,
  CreateClientRequest,
  formatPhone,
  parsePhone,
  PHONE_INVALID,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../shared/error-message';
import { ClientsService } from './clients.service';

export interface ClientDialogData {
  /** The Klient to edit; without it the dialog adds a new one. */
  client?: ClientView;
  /** What a new Klient starts with, e.g. what was typed in a search. */
  name?: string;
  phone?: string;
  /**
   * On a taken phone, also offer to take the Klient who has it instead of adding one,
   * e.g. in the form of a Wizyta.
   */
  canPickExisting?: boolean;
}

/** Opens the dialog; resolves with the saved or picked Klient, `undefined` if cancelled. */
export function openClientDialog(
  dialog: MatDialog,
  data: ClientDialogData,
): Promise<ClientView | undefined> {
  return firstValueFrom(
    dialog
      .open<ClientDialog, ClientDialogData, ClientView>(ClientDialog, {
        data,
        autoFocus: 'first-tabbable',
      })
      .afterClosed(),
  );
}

/** Empty is fine; anything else has to be a number `parsePhone` accepts. */
function phoneValidator(
  control: AbstractControl<string>,
): ValidationErrors | null {
  const value = control.value.trim();
  return value && !parsePhone(value) ? { phone: true } : null;
}

function phoneTaken(error: unknown): ClientView[] | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 409) {
    return null;
  }
  const body = error.error as Partial<ClientPhoneTakenResponse> | null;
  return Array.isArray(body?.clients) ? body.clients : null;
}

/**
 * Adds or edits one Klient and saves it itself, so an error from the api shows in the
 * dialog. A phone another Klient has is saved only after "Zapisz mimo to".
 * Closes with the saved Klient, or the existing one picked instead.
 */
@Component({
  selector: 'app-client-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ client ? client.name : 'Nowy Klient' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save(false)">
      <mat-dialog-content>
        <mat-form-field appearance="outline">
          <mat-label>Imię</mat-label>
          <input matInput formControlName="name" autocomplete="off" />
          @if (form.controls.name.hasError('maxlength')) {
            <mat-error>{{ messages.nameTooLong }}</mat-error>
          } @else if (form.controls.name.invalid) {
            <mat-error>{{ messages.nameRequired }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Telefon</mat-label>
          <input
            matInput
            formControlName="phone"
            type="tel"
            inputmode="tel"
            autocomplete="off"
          />
          <mat-hint>Opcjonalny</mat-hint>
          @if (form.controls.phone.invalid) {
            <mat-error>{{ messages.phoneInvalid }}</mat-error>
          }
        </mat-form-field>

        @if (duplicates(); as clients) {
          <div class="duplicates" role="alert">
            <p>
              <mat-icon aria-hidden="true">warning</mat-icon>
              {{ messages.phoneTaken }}:
            </p>
            <ul>
              @for (other of clients; track other.id) {
                <li>
                  <span>
                    <strong>{{ other.name }}</strong>
                    @if (other.phoneE164) {
                      {{ formatPhone(other.phoneE164) }}
                    }
                  </span>
                  @if (canPickExisting) {
                    <button
                      mat-button
                      type="button"
                      (click)="pick(other)"
                      [attr.aria-label]="'Wybierz: ' + other.name"
                    >
                      Wybierz
                    </button>
                  }
                </li>
              }
            </ul>
          </div>
        }

        <mat-form-field appearance="outline" class="notes">
          <mat-label>Uwagi</mat-label>
          <textarea
            matInput
            formControlName="notes"
            rows="3"
            [maxlength]="notesMax"
            aria-describedby="client-notes-hint"
          ></textarea>
        </mat-form-field>
        <p id="client-notes-hint" class="notes-hint">
          {{ messages.notesHint }}
        </p>

        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Anuluj</button>
        @if (duplicates()) {
          <button
            mat-flat-button
            type="button"
            [disabled]="pending()"
            (click)="save(true)"
          >
            Zapisz mimo to
          </button>
        } @else {
          <button mat-flat-button type="submit" [disabled]="pending()">
            Zapisz
          </button>
        }
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
    .notes {
      margin-bottom: 0;
    }
    .notes-hint {
      margin: 0 0 8px;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    .duplicates {
      margin: 0 0 16px;
      padding: 8px 12px;
      border-radius: 12px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
    .duplicates p {
      display: flex;
      gap: 8px;
      align-items: center;
      margin: 0 0 4px;
    }
    .duplicates ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .duplicates li {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      min-height: 40px;
    }
    .error {
      color: var(--mat-sys-error);
      margin: 8px 0 0;
    }
  `,
})
export class ClientDialog {
  private readonly api = inject(ClientsService);
  private readonly ref =
    inject<MatDialogRef<ClientDialog, ClientView>>(MatDialogRef);
  private readonly data = inject<ClientDialogData>(MAT_DIALOG_DATA);
  protected readonly client = this.data.client;
  protected readonly canPickExisting = this.data.canPickExisting ?? false;

  protected readonly messages = {
    nameRequired: CLIENT_NAME_REQUIRED,
    nameTooLong: CLIENT_NAME_TOO_LONG,
    phoneInvalid: PHONE_INVALID,
    phoneTaken: CLIENT_PHONE_TAKEN,
    notesHint: CLIENT_NOTES_HINT,
  };
  protected readonly notesMax = CLIENT_NOTES_MAX_LENGTH;
  protected readonly formatPhone = formatPhone;

  protected readonly form = new FormGroup({
    name: new FormControl(this.client?.name ?? this.data.name ?? '', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(CLIENT_NAME_MAX_LENGTH),
      ],
    }),
    phone: new FormControl(
      this.client?.phoneE164
        ? formatPhone(this.client.phoneE164)
        : (this.data.phone ?? ''),
      { nonNullable: true, validators: phoneValidator },
    ),
    notes: new FormControl(this.client?.notes ?? '', { nonNullable: true }),
  });

  /** Other Klienci with the phone, after the api answered `409`. */
  protected readonly duplicates = signal<ClientView[] | null>(null);
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // The warning was about the number typed before.
    this.form.controls.phone.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.duplicates.set(null));
  }

  protected pick(existing: ClientView): void {
    this.ref.close(existing);
  }

  protected async save(acceptDuplicatePhone: boolean): Promise<void> {
    if (this.pending()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const fields = this.form.getRawValue();
    const body: CreateClientRequest = {
      name: fields.name.trim(),
      phone: fields.phone.trim() || null,
      notes: fields.notes.trim() || null,
      ...(acceptDuplicatePhone && { acceptDuplicatePhone }),
    };
    this.pending.set(true);
    this.error.set(null);
    try {
      this.ref.close(
        this.client
          ? await this.api.update(this.client.id, body)
          : await this.api.create(body),
      );
    } catch (error) {
      const clients = phoneTaken(error);
      if (clients) this.duplicates.set(clients);
      else this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}

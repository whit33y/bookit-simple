import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, inject, signal } from '@angular/core';
import {
  form,
  FormField,
  maxLength,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogConfig,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  ABSENCE_ENDS_AT_INVALID,
  ABSENCE_REASON_MAX_LENGTH,
  ABSENCE_REASON_TOO_LONG,
  ABSENCE_STAFF_REQUIRED,
  ABSENCE_STARTS_AT_INVALID,
  AbsenceView,
  CalendarDay,
  CalendarStaffMember,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../shared/error-message';
import {
  absenceChanges,
  absenceFields,
  AbsenceFields,
  absenceRequest,
  fieldOfError,
  newAbsenceFields,
} from './absence-request';
import { AbsencesService } from './absences.service';
import { PHONE_QUERY } from './visit-dialog';

type RefusedField = NonNullable<ReturnType<typeof fieldOfError>>;

export interface AbsenceDialogData {
  /** The columns of the calendar: who can get a Nieobecność, and the names of the rest. */
  staff: CalendarStaffMember[];
  /** The Nieobecność to edit or remove; without it the dialog adds a new one. */
  absence?: AbsenceView;
  /** The person and the day a new Nieobecność starts with. */
  staffMemberId?: string;
  day: CalendarDay;
}

/** Opens the form, on the whole screen of a phone; resolves with `true` after a change. */
export function openAbsenceDialog(
  dialog: MatDialog,
  breakpoints: BreakpointObserver,
  data: AbsenceDialogData,
): Promise<boolean> {
  const size: MatDialogConfig = breakpoints.isMatched(PHONE_QUERY)
    ? {
        width: '100vw',
        maxWidth: '100vw',
        height: '100dvh',
        maxHeight: '100dvh',
        panelClass: 'full-screen-dialog',
      }
    : { width: '520px' };
  return firstValueFrom(
    dialog
      .open<AbsenceDialog, AbsenceDialogData, boolean>(
        AbsenceDialog,
        {
          ...size,
          data,
          autoFocus: data.absence ? 'dialog' : 'first-tabbable',
        },
      )
      .afterClosed(),
  ).then(Boolean);
}

/**
 * Adds, edits or removes a Nieobecność and saves it itself. "Cały dzień" takes whole
 * days from the first to the last, also over a change of the clocks; without it the
 * Nieobecność runs between two times. A `422` of the API comes under its field.
 */
@Component({
  selector: 'app-absence-dialog',
  imports: [
    FormField,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ absence ? 'Edycja Nieobecności' : 'Nowa Nieobecność' }}
    </h2>
    <form novalidate (submit)="$event.preventDefault(); save()">
      <mat-dialog-content>
        <mat-form-field appearance="outline">
          <mat-label>Osoba</mat-label>
          <mat-select [formField]="f.staffMemberId">
            @for (person of staffOptions; track person.id) {
              <mat-option [value]="person.id">{{ person.label }}</mat-option>
            }
          </mat-select>
          <mat-error>{{ firstError(f.staffMemberId) }}</mat-error>
        </mat-form-field>

        <mat-slide-toggle
          class="all-day"
          [checked]="model().allDay"
          (change)="setAllDay($event.checked)"
          >Cały dzień</mat-slide-toggle
        >

        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Od</mat-label>
            <input matInput type="date" [formField]="f.fromDay" />
            <mat-error>{{ firstError(f.fromDay) }}</mat-error>
          </mat-form-field>
          @if (!model().allDay) {
            <mat-form-field appearance="outline">
              <mat-label>Od godziny</mat-label>
              <input matInput type="time" step="300" [formField]="f.fromTime" />
              <mat-error>{{ firstError(f.fromTime) }}</mat-error>
            </mat-form-field>
          }
        </div>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Do</mat-label>
            <input matInput type="date" [formField]="f.toDay" />
            @if (model().allDay) {
              <mat-hint>Ostatni dzień Nieobecności</mat-hint>
            }
            <mat-error>{{ firstError(f.toDay) }}</mat-error>
          </mat-form-field>
          @if (!model().allDay) {
            <mat-form-field appearance="outline">
              <mat-label>Do godziny</mat-label>
              <input matInput type="time" step="300" [formField]="f.toTime" />
              <mat-error>{{ firstError(f.toTime) }}</mat-error>
            </mat-form-field>
          }
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Powód</mat-label>
          <input matInput [formField]="f.reason" />
          <mat-hint>Np. urlop, L4. Nieobowiązkowy</mat-hint>
          <mat-error>{{ firstError(f.reason) }}</mat-error>
        </mat-form-field>

        @if (confirmDelete()) {
          <p class="confirm" role="alert">
            Usunąć tę Nieobecność? Ten czas wróci do kalendarza jako wolny.
          </p>
        }
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions>
        @if (absence) {
          @if (confirmDelete()) {
            <button
              mat-button
              type="button"
              (click)="confirmDelete.set(false)"
            >
              Nie usuwaj
            </button>
            <button
              mat-flat-button
              class="danger"
              type="button"
              [disabled]="pending()"
              (click)="remove()"
            >
              Usuń Nieobecność
            </button>
          } @else {
            <button
              mat-button
              class="delete"
              type="button"
              (click)="confirmDelete.set(true)"
            >
              Usuń
            </button>
          }
        }
        @if (!confirmDelete()) {
          <span class="spacer"></span>
          <button mat-button type="button" mat-dialog-close>Anuluj</button>
          <button mat-flat-button type="submit" [disabled]="pending()">
            Zapisz
          </button>
        }
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: inherit;
    }
    form {
      display: contents;
    }
    mat-dialog-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    mat-form-field {
      width: 100%;
    }
    .all-day {
      margin: -4px 0 12px;
    }
    .row {
      display: flex;
      gap: 12px;
    }
    .row mat-form-field {
      flex: 1;
      min-width: 0;
    }
    mat-dialog-actions {
      justify-content: flex-end;
    }
    .spacer {
      flex: 1;
    }
    .delete {
      color: var(--mat-sys-error);
    }
    .danger {
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
    }
    .error {
      color: var(--mat-sys-error);
      margin: 8px 0 0;
    }
  `,
})
export class AbsenceDialog {
  private readonly api = inject(AbsencesService);
  private readonly ref =
    inject<MatDialogRef<AbsenceDialog, boolean>>(MatDialogRef);
  private readonly data = inject<AbsenceDialogData>(MAT_DIALOG_DATA);

  protected readonly absence = this.data.absence;

  /** The Personel but the Usunięte osoby, unless as the person of the edited one. */
  protected readonly staffOptions = this.data.staff
    .filter(
      (p) => p.visibleUntil === null || p.id === this.absence?.staffMemberId,
    )
    .map((p) => ({
      id: p.id,
      label: p.visibleUntil ? `${p.displayName} (usunięta)` : p.displayName,
    }));

  protected readonly model = signal<AbsenceFields>(this.initialModel());

  /** What the API refused at the last save, shown under its field until it changes. */
  private readonly refused = signal<{
    field: RefusedField;
    key: string;
    message: string;
  } | null>(null);

  protected readonly f = form(this.model, (s) => {
    required(s.staffMemberId, { message: ABSENCE_STAFF_REQUIRED });
    required(s.fromDay, { message: ABSENCE_STARTS_AT_INVALID });
    required(s.toDay, { message: ABSENCE_ENDS_AT_INVALID });
    validate(s.fromTime, ({ value }) =>
      !this.model().allDay && !value()
        ? { kind: 'required', message: ABSENCE_STARTS_AT_INVALID }
        : undefined,
    );
    validate(s.toTime, ({ value }) =>
      !this.model().allDay && !value()
        ? { kind: 'required', message: ABSENCE_ENDS_AT_INVALID }
        : undefined,
    );
    maxLength(s.reason, ABSENCE_REASON_MAX_LENGTH, {
      message: ABSENCE_REASON_TOO_LONG,
    });
    validate(s.staffMemberId, () => this.refusedError('staffMemberId'));
    validate(s.toDay, () => this.refusedError('toDay'));
  });

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);

  protected firstError(field: () => { errors(): { message?: string }[] }) {
    return field().errors()[0]?.message ?? '';
  }

  protected setAllDay(allDay: boolean): void {
    this.model.update((m) => ({ ...m, allDay }));
  }

  protected async save(): Promise<void> {
    if (this.pending()) return;
    await submit(this.f, () => this.send());
  }

  private async send(): Promise<undefined> {
    const body = absenceRequest(this.model());
    this.pending.set(true);
    this.error.set(null);
    try {
      if (this.absence) {
        const changes = absenceChanges(this.absence, body);
        if (Object.keys(changes).length) {
          await this.api.update(this.absence.id, changes);
        }
      } else {
        await this.api.create(body);
      }
      this.ref.close(true);
      return undefined;
    } catch (error) {
      const field = fieldOfError(error);
      if (field) {
        this.refused.set({
          field,
          key: this.keyOf(field),
          message: errorMessage(error),
        });
      } else {
        this.error.set(errorMessage(error));
      }
      return undefined;
    } finally {
      this.pending.set(false);
    }
  }

  protected async remove(): Promise<void> {
    if (!this.absence || this.pending()) return;
    this.pending.set(true);
    this.error.set(null);
    try {
      await this.api.remove(this.absence.id);
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  /**
   * The values a refusal is about: the person, or the whole time of the Nieobecność, so
   * changing its start clears an end before the start too.
   */
  private keyOf(field: RefusedField): string {
    const m = this.model();
    return field === 'staffMemberId'
      ? m.staffMemberId
      : [m.allDay, m.fromDay, m.fromTime, m.toDay, m.toTime].join();
  }

  private refusedError(field: RefusedField) {
    const refused = this.refused();
    return refused?.field === field && refused.key === this.keyOf(field)
      ? { kind: 'server', message: refused.message }
      : undefined;
  }

  private initialModel(): AbsenceFields {
    const { absence, staffMemberId, day } = this.data;
    if (absence) return absenceFields(absence);
    const only = this.staffOptions.length === 1 ? this.staffOptions[0].id : '';
    const person = this.staffOptions.some((p) => p.id === staffMemberId)
      ? staffMemberId
      : only;
    return newAbsenceFields(day, person);
  }
}

import { Component, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  ANNOUNCEMENT_BODY_MAX_LENGTH,
  ANNOUNCEMENT_BODY_REQUIRED,
  ANNOUNCEMENT_ENDS_BEFORE_START,
  ANNOUNCEMENT_SHOW_FROM_INVALID,
  ANNOUNCEMENT_SHOW_UNTIL_INVALID,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_REQUIRED,
  ANNOUNCEMENT_TITLE_TOO_LONG,
  AnnouncementView,
  CalendarDay,
  CreateAnnouncementRequest,
  photoUrl,
  PhotoView,
  warsawDate,
} from '@bookit/shared';
import { errorMessage } from '../shared/error-message';
import { PhotoUpload } from '../shared/photo-upload';
import { AnnouncementsService } from './announcements.service';

export interface AnnouncementDialogData {
  /** The Ogłoszenie to edit; without it the dialog adds a new one. */
  announcement?: AnnouncementView;
}

/** The datepicker works on local midnights; the api on `YYYY-MM-DD`. */
export const dayToDate = (day: CalendarDay): Date => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
};

export const dateToDay = (date: Date): CalendarDay =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

/**
 * Adds or edits one Ogłoszenie and saves it itself, so an error from the api shows in
 * the dialog. The photo uploads at once; the Ogłoszenie points at it once saved.
 * Closes with the saved Ogłoszenie.
 */
@Component({
  selector: 'app-announcement-dialog',
  imports: [
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    PhotoUpload,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ announcement ? announcement.title : 'Nowe Ogłoszenie' }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <mat-form-field appearance="outline">
          <mat-label>Tytuł</mat-label>
          <input matInput formControlName="title" autocomplete="off" />
          <mat-hint align="end"
            >{{ form.controls.title.value.length }} / {{ titleMax }}</mat-hint
          >
          @if (form.controls.title.hasError('maxlength')) {
            <mat-error>{{ messages.titleTooLong }}</mat-error>
          } @else if (form.controls.title.invalid) {
            <mat-error>{{ messages.titleRequired }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Treść</mat-label>
          <textarea
            matInput
            formControlName="body"
            rows="4"
            [maxlength]="bodyMax"
          ></textarea>
          <mat-hint align="end"
            >{{ form.controls.body.value.length }} / {{ bodyMax }}</mat-hint
          >
          @if (form.controls.body.invalid) {
            <mat-error>{{ messages.bodyRequired }}</mat-error>
          }
        </mat-form-field>
        <div class="days">
          <mat-form-field appearance="outline">
            <mat-label>Pokazuj od</mat-label>
            <input
              matInput
              [matDatepicker]="fromPicker"
              formControlName="showFrom"
            />
            <mat-datepicker-toggle matIconSuffix [for]="fromPicker" />
            <mat-datepicker #fromPicker />
            @if (form.controls.showFrom.invalid) {
              <mat-error>{{ messages.showFrom }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Pokazuj do</mat-label>
            <input
              matInput
              [matDatepicker]="untilPicker"
              [min]="form.controls.showFrom.value"
              formControlName="showUntil"
            />
            <mat-datepicker-toggle matIconSuffix [for]="untilPicker" />
            <mat-datepicker #untilPicker />
            <mat-hint>Puste: bez końca</mat-hint>
            @if (form.controls.showUntil.hasError('matDatepickerParse')) {
              <mat-error>{{ messages.showUntil }}</mat-error>
            } @else if (form.controls.showUntil.hasError('matDatepickerMin')) {
              <mat-error>{{ messages.endsBeforeStart }}</mat-error>
            }
          </mat-form-field>
        </div>
        <p class="hint">
          Ogłoszenie jest na Wizytówce od początku pierwszego dnia do końca
          ostatniego, według czasu polskiego.
        </p>
        <app-photo-upload
          [current]="photo()?.url ?? null"
          (uploaded)="photo.set($event)"
        />
        @if (photo()) {
          <button
            mat-button
            type="button"
            class="remove-photo"
            (click)="photo.set(null)"
          >
            Usuń zdjęcie
          </button>
        }
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
      min-width: min(480px, 80vw);
    }
    mat-form-field {
      width: 100%;
      margin-bottom: 12px;
    }
    .days {
      display: flex;
      flex-wrap: wrap;
      gap: 0 12px;
    }
    .days mat-form-field {
      flex: 1 1 180px;
    }
    .hint {
      margin: 0 0 16px;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    .remove-photo {
      align-self: flex-start;
      margin-top: 8px;
    }
    .error {
      color: var(--mat-sys-error);
      margin: 8px 0 0;
    }
  `,
})
export class AnnouncementDialog {
  private readonly api = inject(AnnouncementsService);
  private readonly ref =
    inject<MatDialogRef<AnnouncementDialog, AnnouncementView>>(MatDialogRef);
  protected readonly announcement =
    inject<AnnouncementDialogData>(MAT_DIALOG_DATA).announcement;

  protected readonly messages = {
    titleRequired: ANNOUNCEMENT_TITLE_REQUIRED,
    titleTooLong: ANNOUNCEMENT_TITLE_TOO_LONG,
    bodyRequired: ANNOUNCEMENT_BODY_REQUIRED,
    showFrom: ANNOUNCEMENT_SHOW_FROM_INVALID,
    showUntil: ANNOUNCEMENT_SHOW_UNTIL_INVALID,
    endsBeforeStart: ANNOUNCEMENT_ENDS_BEFORE_START,
  };
  protected readonly titleMax = ANNOUNCEMENT_TITLE_MAX_LENGTH;
  protected readonly bodyMax = ANNOUNCEMENT_BODY_MAX_LENGTH;

  protected readonly form = new FormGroup({
    title: new FormControl(this.announcement?.title ?? '', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(ANNOUNCEMENT_TITLE_MAX_LENGTH),
      ],
    }),
    body: new FormControl(this.announcement?.body ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    showFrom: new FormControl<Date | null>(
      dayToDate(this.announcement?.showFrom ?? warsawDate(new Date())),
      Validators.required,
    ),
    // `[min]` on the datepicker keeps it on or after `showFrom`.
    showUntil: new FormControl<Date | null>(
      this.announcement?.showUntil
        ? dayToDate(this.announcement.showUntil)
        : null,
    ),
  });

  /** Only `id` and `url` are needed; a saved Photo has no other fields here. */
  protected readonly photo = signal<Pick<PhotoView, 'id' | 'url'> | null>(
    this.announcement?.photoId
      ? {
          id: this.announcement.photoId,
          url: photoUrl(this.announcement.photoId),
        }
      : null,
  );
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async save(): Promise<void> {
    if (this.pending()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const fields = this.form.getRawValue();
    const body: CreateAnnouncementRequest = {
      title: fields.title.trim(),
      body: fields.body.trim(),
      photoId: this.photo()?.id ?? null,
      // `required` lets only a day through.
      showFrom: dateToDay(fields.showFrom as Date),
      showUntil: fields.showUntil ? dateToDay(fields.showUntil) : null,
    };
    this.pending.set(true);
    this.error.set(null);
    try {
      this.ref.close(
        this.announcement
          ? await this.api.update(this.announcement.id, body)
          : await this.api.create(body),
      );
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}

import { Component, DestroyRef, inject, signal } from '@angular/core';
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
  CropPhotoRequest,
  PHOTO_MAX_BYTES,
  PHOTO_TOO_LARGE,
  photoUrl,
  PhotoView,
  warsawDate,
} from '@bookit/shared';
import { errorMessage } from '../../../shared/error-message';
import { filter, lastValueFrom, map } from 'rxjs';
import { PhotoCropper } from '../../../shared/photo-cropper/photo-cropper';
import {
  PhotosService,
  PhotoUploadEvent,
} from '../../../shared/photos.service';
import { AnnouncementsService } from '../announcements.service';

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
    PhotoCropper,
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
        @if (cropping(); as source) {
          @if (!photoBusy()) {
            <app-photo-cropper
              [photo]="source"
              [round]="false"
              (cropped)="crop(source, $event)"
              (cancelled)="cancelCrop(source)"
            />
          }
        } @else {
          @if (photo(); as preview) {
            <img
              class="photo-preview"
              [src]="preview.url"
              alt="Zdjęcie Ogłoszenia"
            />
          }
          <input
            #picker
            type="file"
            accept="image/*"
            hidden
            (change)="pick(picker)"
          />
          <div class="photo-actions">
            <button
              mat-stroked-button
              type="button"
              [disabled]="pending() || photoBusy()"
              (click)="picker.click()"
            >
              {{ photo() ? 'Zmień zdjęcie' : 'Wgraj zdjęcie' }}
            </button>
            @if (photo()) {
              <button
                mat-button
                type="button"
                [disabled]="pending() || photoBusy()"
                (click)="removePhoto()"
              >
                Usuń zdjęcie
              </button>
            }
          </div>
        }
        @if (photoBusy()) {
          <p role="status">Przetwarzanie zdjęcia…</p>
        }
        @if (photoError(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button
          mat-button
          type="button"
          [disabled]="pending()"
          (click)="cancel()"
        >
          Anuluj
        </button>
        <button
          mat-flat-button
          type="submit"
          [disabled]="pending() || photoBusy() || !!cropping()"
        >
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
    .photo-preview {
      display: block;
      max-width: 100%;
      width: 160px;
      height: auto;
      margin-bottom: 8px;
      border-radius: 8px;
    }
    .photo-actions {
      display: flex;
      gap: 8px;
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
  private readonly photos = inject(PhotosService);
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

  protected readonly cropping = signal<PhotoView | null>(null);
  protected readonly photoBusy = signal(false);
  protected readonly photoError = signal<string | null>(null);
  private readonly uploads = new Set<string>();
  private closed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.closed = true;
      // An in-flight crop replaces its source; an in-flight save may attach its result.
      if (!this.photoBusy() && !this.pending()) this.discardUploads();
    });
  }

  protected async pick(picker: HTMLInputElement): Promise<void> {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file || this.pending() || this.photoBusy() || this.cropping()) return;
    if (file.size > PHOTO_MAX_BYTES) {
      this.photoError.set(PHOTO_TOO_LARGE);
      return;
    }
    this.photoError.set(null);
    this.photoBusy.set(true);
    try {
      const source = await lastValueFrom(
        this.photos.upload(file).pipe(
          filter(
            (event): event is Extract<PhotoUploadEvent, { photo: PhotoView }> =>
              'photo' in event,
          ),
          map((event) => event.photo),
        ),
      );
      this.uploads.add(source.id);
      if (!this.closed) this.cropping.set(source);
    } catch (error) {
      this.photoError.set(errorMessage(error));
    } finally {
      this.photoBusy.set(false);
      if (this.closed) this.discardUploads();
    }
  }

  protected async crop(
    source: PhotoView,
    square: CropPhotoRequest,
  ): Promise<void> {
    if (this.photoBusy() || this.pending()) return;
    this.photoBusy.set(true);
    this.photoError.set(null);
    try {
      const cropped = await this.photos.crop(source.id, {
        ...square,
        purpose: 'announcement',
      });
      this.uploads.delete(source.id);
      this.uploads.add(cropped.id);
      if (!this.closed) {
        const previous = this.photo()?.id;
        this.photo.set(cropped);
        this.cropping.set(null);
        if (previous && this.uploads.has(previous)) this.discard(previous);
      }
    } catch (error) {
      this.photoError.set(errorMessage(error));
    } finally {
      this.photoBusy.set(false);
      if (this.closed) this.discardUploads();
    }
  }

  protected cancelCrop(source: PhotoView): void {
    if (this.photoBusy()) return;
    this.cropping.set(null);
    this.photoError.set(null);
    this.discard(source.id);
  }

  protected removePhoto(): void {
    const id = this.photo()?.id;
    this.photo.set(null);
    if (id && this.uploads.has(id)) this.discard(id);
  }

  protected cancel(): void {
    if (this.pending()) return;
    this.closed = true;
    if (!this.photoBusy()) this.discardUploads();
    this.ref.close();
  }

  private discardUploads(): void {
    for (const id of this.uploads) this.discard(id);
  }

  private discard(id: string): void {
    this.uploads.delete(id);
    this.photos.removeUnused(id).catch(() => undefined);
  }

  protected async save(): Promise<void> {
    if (this.pending() || this.photoBusy() || this.cropping()) return;
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
    const disableClose = this.ref.disableClose;
    this.ref.disableClose = true;
    this.error.set(null);
    try {
      const saved = this.announcement
        ? await this.api.update(this.announcement.id, body)
        : await this.api.create(body);
      if (saved.photoId) this.uploads.delete(saved.photoId);
      this.discardUploads();
      this.ref.close(saved);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
      this.ref.disableClose = disableClose;
      if (this.closed) this.discardUploads();
    }
  }
}

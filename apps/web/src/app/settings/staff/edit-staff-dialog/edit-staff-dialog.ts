import { Component, DestroyRef, inject, signal } from '@angular/core';
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
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  CropPhotoRequest,
  PHOTO_MAX_BYTES,
  PHOTO_TOO_LARGE,
  PhotoView,
  photoUrl,
  STAFF_BIO_MAX_LENGTH,
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  StaffMemberView,
  StaffRole,
  UpdateStaffRequest,
} from '@bookit/shared';
import { filter, lastValueFrom, map } from 'rxjs';
import { errorMessage } from '../../../shared/error-message';
import { PhotoCropper } from '../../../shared/photo-cropper/photo-cropper';
import {
  PhotoUploadEvent,
  PhotosService,
} from '../../../shared/photos.service';
import { StaffService } from '../staff.service';

/**
 * Edits one person of the Personel and saves it itself, so an error such as the last
 * Właściciel losing the role shows in the dialog. Closes with the saved person.
 *
 * The Zdjęcie profilowe is uploaded and cropped at once, but saved only with "Zapisz";
 * every photo uploaded here and not saved is deleted when the dialog closes, so the
 * Wizytówka keeps the previous one. The api deletes the previous one on save.
 */
@Component({
  selector: 'app-edit-staff-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    PhotoCropper,
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
        <h3 class="label">Zdjęcie profilowe</h3>
        @if (cropping(); as photo) {
          <app-photo-cropper
            [photo]="photo"
            (cropped)="crop(photo, $event)"
            (cancelled)="cancelCrop(photo)"
          />
        } @else {
          <div class="photo">
            <div class="profile-photo">
              @if (photoId(); as id) {
                <img [src]="photoUrl(id)" alt="" />
              } @else {
                <span aria-hidden="true">{{
                  member.displayName.charAt(0)
                }}</span>
              }
            </div>
            <div class="photo-actions">
              <input
                #picker
                type="file"
                accept="image/*"
                hidden
                (change)="pick(picker)"
              />
              <button
                mat-stroked-button
                type="button"
                [disabled]="photoBusy()"
                (click)="picker.click()"
              >
                {{ photoId() ? 'Zmień zdjęcie' : 'Wgraj zdjęcie' }}
              </button>
              @if (photoId()) {
                <button
                  mat-button
                  type="button"
                  [disabled]="photoBusy()"
                  (click)="photoId.set(null)"
                >
                  Usuń zdjęcie
                </button>
              }
            </div>
          </div>
        }
        @if (photoBusy()) {
          <mat-progress-bar
            mode="indeterminate"
            aria-label="Wysyłanie zdjęcia"
          />
        }
        @if (photoError(); as message) {
          <p class="error photo-error" role="alert">{{ message }}</p>
        }
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
        <button mat-button type="button" (click)="cancel()">Anuluj</button>
        <button
          mat-flat-button
          type="submit"
          [disabled]="pending() || photoBusy() || cropping()"
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
    .label {
      margin: 0 0 8px;
      font: var(--mat-sys-title-small);
    }
    .photo {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    /* The shape of the Zespół section of the Wizytówka. */
    .profile-photo {
      flex: none;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      overflow: hidden;
      display: grid;
      place-items: center;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      font-size: 40px;
    }
    .profile-photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .photo-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    mat-progress-bar {
      margin-top: 8px;
    }
    .photo-error {
      margin: 8px 0 0;
      font-size: 12px;
    }
    .photo + mat-slide-toggle,
    app-photo-cropper + mat-slide-toggle,
    mat-progress-bar + mat-slide-toggle,
    .photo-error + mat-slide-toggle {
      margin-top: 16px;
    }
  `,
})
export class EditStaffDialog {
  private readonly api = inject(StaffService);
  private readonly photos = inject(PhotosService);
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

  protected readonly photoUrl = photoUrl;
  /** The Zdjęcie profilowe in the circle; `PATCH` gets it only with "Zapisz". */
  protected readonly photoId = signal(this.member.photoId);
  /** An uploaded Photo waiting for its frame. */
  protected readonly cropping = signal<PhotoView | null>(null);
  /** Uploading or cropping. */
  protected readonly photoBusy = signal(false);
  protected readonly photoError = signal<string | null>(null);
  /** Photos uploaded in this dialog and still in the Salon; deleted unless saved. */
  private readonly uploads = new Set<string>();
  private closed = false;

  constructor() {
    // Also Escape and a click outside the dialog.
    inject(DestroyRef).onDestroy(() => {
      this.closed = true;
      this.discardUploads();
    });
  }

  protected async pick(picker: HTMLInputElement): Promise<void> {
    const file = picker.files?.[0];
    // Cleared, so choosing the same file again fires `change` again.
    picker.value = '';
    if (!file) return;
    if (file.size > PHOTO_MAX_BYTES) {
      this.photoError.set(PHOTO_TOO_LARGE);
      return;
    }
    this.photoError.set(null);
    this.photoBusy.set(true);
    try {
      const photo = await lastValueFrom(
        this.photos.upload(file).pipe(
          filter(
            (event): event is Extract<PhotoUploadEvent, { photo: PhotoView }> =>
              'photo' in event,
          ),
          map((event) => event.photo),
        ),
      );
      this.uploads.add(photo.id);
      if (this.closed) this.discardUploads();
      else this.cropping.set(photo);
    } catch (error) {
      this.photoError.set(errorMessage(error));
    } finally {
      this.photoBusy.set(false);
    }
  }

  /** The api replaces the uploaded Photo with the cropped one. */
  protected async crop(
    source: PhotoView,
    square: CropPhotoRequest,
  ): Promise<void> {
    this.photoBusy.set(true);
    this.photoError.set(null);
    try {
      const photo = await this.photos.crop(source.id, square);
      this.uploads.delete(source.id);
      this.uploads.add(photo.id);
      if (this.closed) return this.discardUploads();
      this.photoId.set(photo.id);
      this.cropping.set(null);
    } catch (error) {
      this.photoError.set(errorMessage(error));
    } finally {
      this.photoBusy.set(false);
    }
  }

  protected cancelCrop(source: PhotoView): void {
    this.cropping.set(null);
    this.discard(source.id);
  }

  protected cancel(): void {
    this.discardUploads();
    this.ref.close();
  }

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
    const photoId = this.photoId();
    if (photoId !== this.member.photoId) body.photoId = photoId;
    this.pending.set(true);
    this.error.set(null);
    try {
      const saved = await this.api.update(this.member.id, body);
      if (saved.photoId) this.uploads.delete(saved.photoId);
      this.discardUploads();
      this.ref.close(saved);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private discardUploads(): void {
    for (const id of [...this.uploads]) this.discard(id);
  }

  /** A failure leaves an unused Photo, which no one sees. */
  private discard(id: string): void {
    this.uploads.delete(id);
    this.photos.remove(id).catch(() => undefined);
  }
}

import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { PHOTO_MAX_BYTES, PHOTO_TOO_LARGE, PhotoView } from '@bookit/shared';
import { Subscription } from 'rxjs';
import { errorMessage } from '../error-message';
import { PhotosService } from '../photos.service';

/**
 * Picks a photo, uploads it at once and emits the saved Photo, for the logo, the
 * Wizytówka header, Ogłoszenia, the gallery and the Personel. The parent saves the
 * id where it belongs. `accept="image/*"` makes Safari on iOS usually send a JPEG;
 * a HEIC from elsewhere is converted by the api.
 */
@Component({
  selector: 'app-photo-upload',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="preview">
      @if (preview(); as src) {
        <img [src]="src" [alt]="label()" />
      } @else {
        <mat-icon aria-hidden="true">image</mat-icon>
      }
    </div>
    <div class="side">
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
        [disabled]="progress() !== null"
        (click)="picker.click()"
      >
        {{ preview() ? 'Zmień zdjęcie' : label() }}
      </button>
      @if (percent() !== null) {
        <mat-progress-bar
          mode="determinate"
          [value]="percent()"
          aria-label="Wysyłanie zdjęcia"
        />
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      } @else {
        <p class="hint">JPEG, PNG, WebP lub HEIC, do 10 MB</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .preview {
      flex: none;
      width: 96px;
      height: 96px;
      border-radius: 8px;
      overflow: hidden;
      display: grid;
      place-items: center;
      background: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface-variant);
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .side {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      min-width: 0;
    }
    mat-progress-bar {
      max-width: 240px;
    }
    .hint,
    .error {
      margin: 0;
      font-size: 12px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class PhotoUpload {
  private readonly photos = inject(PhotosService);

  /** Address of the Photo saved so far, e.g. `PhotoView.url`; `null` for none. */
  readonly current = input<string | null>(null);
  /** Text of the button while there is no photo. */
  readonly label = input('Dodaj zdjęcie');
  /** The Photo is saved; its id goes into the form of the parent. */
  readonly uploaded = output<PhotoView>();

  /** Share of the upload sent, from 0 to 1; `null` while nothing uploads. */
  protected readonly progress = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  /** The file being sent or just saved; a new `current`, e.g. a removed photo, replaces it. */
  private readonly picked = linkedSignal<string | null, string | null>({
    source: this.current,
    computation: () => null,
  });
  protected readonly preview = computed(() => this.picked() ?? this.current());
  protected readonly percent = computed(() => {
    const progress = this.progress();
    return progress === null ? null : Math.round(progress * 100);
  });

  private objectUrl: string | null = null;
  private upload?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.upload?.unsubscribe();
      this.revokePreview();
    });
  }

  protected pick(picker: HTMLInputElement): void {
    const file = picker.files?.[0];
    // Cleared, so choosing the same file again fires `change` again.
    picker.value = '';
    if (!file) return;
    if (file.size > PHOTO_MAX_BYTES) {
      this.error.set(PHOTO_TOO_LARGE);
      return;
    }

    this.error.set(null);
    this.revokePreview();
    this.objectUrl = URL.createObjectURL(file);
    this.picked.set(this.objectUrl);
    this.progress.set(0);
    this.upload = this.photos.upload(file).subscribe({
      next: (event) => {
        if ('progress' in event) {
          this.progress.set(event.progress);
          return;
        }
        this.revokePreview();
        this.picked.set(event.photo.url);
        this.uploaded.emit(event.photo);
      },
      error: (error: unknown) => {
        this.revokePreview();
        this.picked.set(null);
        this.progress.set(null);
        this.error.set(errorMessage(error));
      },
      complete: () => this.progress.set(null),
    });
  }

  private revokePreview(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }
}

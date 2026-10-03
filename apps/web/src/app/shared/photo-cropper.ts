import { Component, input, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { CropPhotoRequest, PhotoView } from '@bookit/shared';
import { ImageCropperComponent } from 'ngx-image-cropper';

/**
 * Frames a square of an uploaded Photo in a circle, for a Zdjęcie profilowe. One finger
 * moves the circle, two fingers make it larger or smaller. Emits the square in pixels
 * of the Photo; the parent sends it to `POST /api/photos/:id/crop`.
 */
@Component({
  selector: 'app-photo-cropper',
  imports: [ImageCropperComponent, MatButtonModule],
  template: `
    <image-cropper
      [imageURL]="photo().url"
      [maintainAspectRatio]="true"
      [aspectRatio]="1"
      [roundCropper]="true"
      [autoCrop]="false"
      [checkImageType]="false"
      output="base64"
      cropperFrameAriaLabel="Kadr zdjęcia"
      (cropperReady)="ready.set(true)"
      (loadImageFailed)="failed.set(true)"
    />
    @if (failed()) {
      <p class="error" role="alert">Nie udało się wczytać zdjęcia</p>
    } @else {
      <p class="hint">
        Przesuń kółko palcem. Dwoma palcami je powiększysz lub zmniejszysz.
      </p>
    }
    <div class="actions">
      <button mat-button type="button" (click)="cancelled.emit()">
        Anuluj kadrowanie
      </button>
      <button
        mat-flat-button
        type="button"
        [disabled]="!ready()"
        (click)="confirm()"
      >
        Zatwierdź kadr
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    image-cropper {
      max-height: 55vh;
      padding: 0;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
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
export class PhotoCropper {
  /** The uploaded Photo to frame. */
  readonly photo = input.required<PhotoView>();
  readonly cropped = output<CropPhotoRequest>();
  readonly cancelled = output<void>();

  protected readonly ready = signal(false);
  protected readonly failed = signal(false);
  private readonly cropper = viewChild.required(ImageCropperComponent);

  protected confirm(): void {
    const position = this.cropper().crop('base64')?.imagePosition;
    if (!position) return;
    this.cropped.emit(
      squareWithin(
        position.x1,
        position.y1,
        Math.min(position.x2 - position.x1, position.y2 - position.y1),
        this.photo(),
      ),
    );
  }
}

/** Whole pixels, never outside the Photo, which the api would answer with `400`. */
export function squareWithin(
  x: number,
  y: number,
  size: number,
  { width, height }: { width: number; height: number },
): CropPhotoRequest {
  const side = Math.max(1, Math.min(Math.round(size), width, height));
  const clamp = (value: number, max: number) =>
    Math.min(Math.max(Math.round(value), 0), max);
  return { x: clamp(x, width - side), y: clamp(y, height - side), size: side };
}

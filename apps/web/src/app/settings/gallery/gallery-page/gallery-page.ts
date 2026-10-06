import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  GALLERY_FULL,
  GALLERY_MAX_PHOTOS,
  GalleryPhotoView,
  PHOTO_MAX_BYTES,
  PHOTO_TOO_LARGE,
  PhotoView,
  galleryPlacesLeft,
} from '@bookit/shared';
import { firstValueFrom, Subscription } from 'rxjs';
import { errorMessage } from '../../../shared/error-message';
import { PhotosService } from '../../../shared/photos.service';
import {
  DeleteGalleryPhotoDialog,
  DeleteGalleryPhotoDialogData,
} from '../delete-gallery-photo-dialog/delete-gallery-photo-dialog';
import { GalleryService } from '../gallery.service';

/** One picked file on its way into the gallery. */
interface Upload {
  id: number;
  file: File;
  /** Share sent so far, from 0 to 1. */
  progress: number;
  state: 'waiting' | 'sending' | 'failed';
  error: string | null;
}

/** "1 zdjęcie", "3 zdjęcia", "5 zdjęć". */
export function photosCount(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (count === 1) return '1 zdjęcie';
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) {
    return `${count} zdjęcia`;
  }
  return `${count} zdjęć`;
}

/**
 * `/panel/ustawienia/galeria`: the Właściciel adds many photos at once, sets their order
 * by dragging and deletes them (#21). Picked files upload one after another, each with
 * its own progress; a selection over `GALLERY_MAX_PHOTOS` is refused before sending.
 */
@Component({
  selector: 'app-gallery-page',
  imports: [
    CdkDrag,
    CdkDropList,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <h1>Galeria</h1>

    @if (photos(); as photos) {
      <section class="card" aria-labelledby="add-heading">
        <h2 id="add-heading">Dodaj zdjęcia</h2>
        <input
          #picker
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Wybierz zdjęcia"
          (change)="pick(picker)"
        />
        <div class="add">
          <button
            mat-flat-button
            type="button"
            [disabled]="placesLeft() === 0"
            (click)="picker.click()"
          >
            <mat-icon>add_photo_alternate</mat-icon>
            Wybierz zdjęcia
          </button>
          <span class="hint">
            {{ photos.length }} z {{ max }} ·
            @if (placesLeft() === 0) {
              galeria jest pełna
            } @else {
              JPEG, PNG, WebP lub HEIC, do 10 MB każde
            }
          </span>
        </div>
        @if (pickError(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        @if (uploads().length > 0) {
          <ul class="uploads" aria-label="Wysyłane zdjęcia">
            @for (upload of uploads(); track upload.id) {
              <li>
                <span class="file">{{ upload.file.name }}</span>
                @if (upload.state === 'failed') {
                  <span class="error" role="alert">{{ upload.error }}</span>
                  <button
                    mat-icon-button
                    type="button"
                    (click)="dismiss(upload)"
                    [attr.aria-label]="'Zamknij: ' + upload.file.name"
                    matTooltip="Zamknij"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                } @else {
                  <mat-progress-bar
                    mode="determinate"
                    [value]="percent(upload)"
                    [attr.aria-label]="'Wysyłanie: ' + upload.file.name"
                  />
                  <span class="state">
                    {{
                      upload.state === 'waiting'
                        ? 'czeka'
                        : percent(upload) + '%'
                    }}
                  </span>
                }
              </li>
            }
          </ul>
        }
      </section>

      @if (actionError(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }

      @if (photos.length === 0) {
        <p class="empty">
          Galeria jest pusta. Dodaj zdjęcia salonu albo swoich prac, pokażemy je
          na Wizytówce.
        </p>
      } @else {
        <p class="hint">Przeciągnij zdjęcie, aby zmienić kolejność.</p>
        <ul
          class="grid"
          cdkDropList
          cdkDropListOrientation="mixed"
          [cdkDropListDisabled]="busy()"
          (cdkDropListDropped)="drop($event)"
          aria-label="Zdjęcia galerii"
        >
          @for (photo of photos; track photo.id; let i = $index) {
            <li class="tile" cdkDrag>
              <img [src]="photo.url" [alt]="'Zdjęcie ' + (i + 1)" />
              <button
                mat-mini-fab
                class="delete"
                type="button"
                [disabled]="busy()"
                (click)="remove(photo)"
                [attr.aria-label]="'Usuń zdjęcie ' + (i + 1)"
                matTooltip="Usuń"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </li>
          }
        </ul>
      }
    } @else if (loadError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else {
      <mat-spinner diameter="32" aria-label="Wczytywanie" />
    }
  `,
  styles: `
    h1 {
      margin: 0 0 16px;
    }
    .card {
      padding: 16px 20px;
      border-radius: 16px;
      background: var(--mat-sys-surface-container);
      margin-bottom: 16px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 16px;
    }
    .add {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      align-items: center;
    }
    .hint,
    .empty,
    .state {
      color: var(--mat-sys-on-surface-variant);
    }
    .hint {
      font-size: 14px;
    }
    .error {
      color: var(--mat-sys-error);
    }
    .uploads {
      list-style: none;
      margin: 16px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .uploads li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(80px, 2fr) auto;
      gap: 12px;
      align-items: center;
      min-height: 40px;
    }
    .file {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .uploads .error {
      font-size: 14px;
    }
    .state {
      font-size: 12px;
      min-width: 36px;
      text-align: end;
    }
    .grid {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .tile {
      position: relative;
      width: 140px;
      height: 140px;
      border-radius: 12px;
      overflow: hidden;
      cursor: grab;
      background: var(--mat-sys-surface-container);
    }
    .tile img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      pointer-events: none;
    }
    .delete {
      position: absolute;
      top: 6px;
      right: 6px;
    }
    @media (max-width: 480px) {
      .tile {
        width: calc(50% - 6px);
        height: auto;
        aspect-ratio: 1;
      }
    }
    .cdk-drag-preview {
      box-shadow: var(--mat-sys-level3);
    }
    .cdk-drag-placeholder {
      opacity: 0.3;
    }
    .cdk-drag-animating {
      transition: transform 200ms ease;
    }
  `,
})
export class GalleryPage implements OnInit {
  private readonly api = inject(GalleryService);
  private readonly photosApi = inject(PhotosService);
  private readonly dialog = inject(MatDialog);

  protected readonly max = GALLERY_MAX_PHOTOS;

  protected readonly photos = signal<GalleryPhotoView[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly uploads = signal<Upload[]>([]);
  /** Why the last selection was not sent. */
  protected readonly pickError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  /** A delete or a reorder is in progress. */
  protected readonly busy = signal(false);

  /** Places not taken by the gallery nor by files still on their way. */
  protected readonly placesLeft = computed(() => {
    const pending = this.uploads().filter((u) => u.state !== 'failed').length;
    return galleryPlacesLeft((this.photos()?.length ?? 0) + pending);
  });

  private nextId = 0;
  private sending = false;
  private destroyed = false;
  private upload?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.upload?.unsubscribe();
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.photos.set(await this.api.list());
    } catch (error) {
      this.loadError.set(errorMessage(error));
    }
  }

  protected percent(upload: Upload): number {
    return Math.round(upload.progress * 100);
  }

  /** Refuses the whole selection when it does not fit, so nothing is half-added. */
  protected pick(picker: HTMLInputElement): void {
    const files = [...(picker.files ?? [])];
    // Cleared, so choosing the same files again fires `change` again.
    picker.value = '';
    if (files.length === 0) return;

    const left = this.placesLeft();
    if (files.length > left) {
      this.pickError.set(
        left === 0
          ? GALLERY_FULL
          : `${GALLERY_FULL}. Możesz dodać jeszcze ${photosCount(left)}, a wybrano ${photosCount(files.length)}.`,
      );
      return;
    }
    this.pickError.set(null);
    this.uploads.update((list) => [
      ...list,
      ...files.map((file): Upload =>
        file.size > PHOTO_MAX_BYTES
          ? { ...this.newUpload(file), state: 'failed', error: PHOTO_TOO_LARGE }
          : this.newUpload(file),
      ),
    ]);
    void this.sendAll();
  }

  protected dismiss(upload: Upload): void {
    this.uploads.update((list) => list.filter((u) => u.id !== upload.id));
  }

  protected async remove(photo: GalleryPhotoView): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<DeleteGalleryPhotoDialog, DeleteGalleryPhotoDialogData, boolean>(
          DeleteGalleryPhotoDialog,
          { data: { url: photo.url } },
        )
        .afterClosed(),
    );
    if (!confirmed) return;
    await this.run(async () => {
      await this.api.remove(photo.id);
      this.photos.update(
        (list) => list?.filter((p) => p.id !== photo.id) ?? null,
      );
    });
  }

  /** Moves the photo at once and saves; a failed save puts it back. */
  protected async drop(event: CdkDragDrop<unknown>): Promise<void> {
    const before = this.photos();
    if (!before || event.previousIndex === event.currentIndex) return;
    const after = [...before];
    moveItemInArray(after, event.previousIndex, event.currentIndex);
    this.photos.set(after);
    await this.run(async () => {
      try {
        await this.api.reorder(after.map((p) => p.id));
      } catch (error) {
        this.photos.set(before);
        throw error;
      }
    });
  }

  private newUpload(file: File): Upload {
    return {
      id: this.nextId++,
      file,
      progress: 0,
      state: 'waiting',
      error: null,
    };
  }

  /** One file at a time, in the order picked, until none is waiting. */
  private async sendAll(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      let next: Upload | undefined;
      while (
        !this.destroyed &&
        (next = this.uploads().find((u) => u.state === 'waiting'))
      ) {
        await this.send(next);
      }
    } finally {
      this.sending = false;
    }
  }

  private async send(upload: Upload): Promise<void> {
    this.patch(upload, { state: 'sending' });
    let photo: PhotoView;
    try {
      photo = await this.uploadFile(upload);
    } catch (error) {
      this.patch(upload, { state: 'failed', error: errorMessage(error) });
      return;
    }
    try {
      const added = await this.api.add(photo.id);
      this.photos.update((list) => [...(list ?? []), added]);
      this.dismiss(upload);
    } catch (error) {
      // The Photo is not in the gallery, so nothing would ever show or delete it.
      this.photosApi.remove(photo.id).catch(() => undefined);
      this.patch(upload, { state: 'failed', error: errorMessage(error) });
      if (error instanceof HttpErrorResponse && error.status === 422) {
        this.failWaiting(errorMessage(error));
      }
    }
  }

  private uploadFile(upload: Upload): Promise<PhotoView> {
    return new Promise((resolve, reject) => {
      this.upload = this.photosApi.upload(upload.file).subscribe({
        next: (event) => {
          if ('progress' in event) {
            this.patch(upload, { progress: event.progress });
          } else {
            resolve(event.photo);
          }
        },
        error: reject,
      });
    });
  }

  /** The gallery filled up elsewhere: the files still waiting would fail the same way. */
  private failWaiting(error: string): void {
    this.uploads.update((list) =>
      list.map((u) =>
        u.state === 'waiting' ? { ...u, state: 'failed', error } : u,
      ),
    );
  }

  private patch(upload: Upload, changes: Partial<Upload>): void {
    this.uploads.update((list) =>
      list.map((u) => (u.id === upload.id ? { ...u, ...changes } : u)),
    );
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await action();
    } catch (error) {
      this.actionError.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

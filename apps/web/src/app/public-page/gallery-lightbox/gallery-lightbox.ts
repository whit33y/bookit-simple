import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { photoUrl, PublicPhoto } from '@bookit/shared';

/** The Galeria: a grid of photos, one opens large in a `<dialog>` with previous and next. */
@Component({
  selector: 'app-gallery-lightbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="grid">
      @for (photo of photos(); track photo.id; let i = $index) {
        <li>
          <button type="button" class="thumb" (click)="open(i)">
            <img
              [src]="url(photo.id)"
              [width]="photo.width"
              [height]="photo.height"
              [alt]="label(i)"
              loading="lazy"
              decoding="async"
            />
          </button>
        </li>
      }
    </ul>
    <dialog
      #dialog
      class="lightbox"
      aria-label="Galeria"
      tabindex="-1"
      (close)="current.set(null)"
      (click)="closeOnBackdrop($event)"
      (keydown.arrowleft)="step(-1)"
      (keydown.arrowright)="step(1)"
    >
      @if (shown(); as photo) {
        <img
          class="large"
          [src]="url(photo.id)"
          [width]="photo.width"
          [height]="photo.height"
          [alt]="label(current() ?? 0)"
        />
        <div class="controls">
          <button
            type="button"
            (click)="step(-1)"
            aria-label="Poprzednie zdjęcie"
          >
            ‹
          </button>
          <span>{{ (current() ?? 0) + 1 }} / {{ photos().length }}</span>
          <button type="button" (click)="step(1)" aria-label="Następne zdjęcie">
            ›
          </button>
          <button
            type="button"
            class="close"
            (click)="dialog.close()"
            aria-label="Zamknij"
          >
            ×
          </button>
        </div>
      }
    </dialog>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .thumb {
      display: block;
      width: 100%;
      padding: 0;
      border: 0;
      border-radius: 8px;
      overflow: hidden;
      background: #eee;
      cursor: zoom-in;
      aspect-ratio: 1;
    }
    .thumb:focus-visible {
      outline: 3px solid var(--accent);
      outline-offset: 2px;
    }
    .thumb img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .lightbox {
      max-width: min(1200px, 100vw);
      max-height: 100vh;
      padding: 0;
      border: 0;
      background: transparent;
      color: #fff;
    }
    .lightbox::backdrop {
      background: rgb(0 0 0 / 85%);
    }
    .large {
      display: block;
      max-width: 100%;
      max-height: calc(100vh - 72px);
      width: auto;
      height: auto;
      margin: 0 auto;
    }
    .controls {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 16px;
      padding: 8px;
    }
    .controls button {
      min-width: 48px;
      min-height: 48px;
      border: 0;
      border-radius: 24px;
      background: rgb(255 255 255 / 15%);
      color: #fff;
      font-size: 1.75rem;
      line-height: 1;
      cursor: pointer;
    }
  `,
})
export class GalleryLightbox {
  readonly photos = input.required<PublicPhoto[]>();
  readonly salonName = input.required<string>();

  /** Index of the photo shown large, `null` when the dialog is closed. */
  protected readonly current = signal<number | null>(null);
  protected readonly shown = computed(() => {
    const index = this.current();
    return index === null ? null : (this.photos()[index] ?? null);
  });

  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly url = photoUrl;

  protected label(index: number): string {
    return `${this.salonName()}: zdjęcie ${index + 1} z ${this.photos().length}`;
  }

  protected open(index: number): void {
    this.current.set(index);
    this.dialog().nativeElement.showModal();
  }

  /** Around the ends: after the last photo comes the first. */
  protected step(by: number): void {
    const index = this.current();
    if (index === null) return;
    const count = this.photos().length;
    this.current.set((index + by + count) % count);
  }

  /** A click on the dimmed area around the photo lands on the `<dialog>` itself. */
  protected closeOnBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.dialog().nativeElement.close();
    }
  }
}

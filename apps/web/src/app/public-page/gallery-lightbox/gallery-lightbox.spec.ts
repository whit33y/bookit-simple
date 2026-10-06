import { TestBed } from '@angular/core/testing';
import { GalleryLightbox } from './gallery-lightbox';

describe('GalleryLightbox', () => {
  // jsdom has no modal dialogs; these do what the browser does for this component.
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (
      this: HTMLDialogElement,
    ) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  });

  function setup() {
    const fixture = TestBed.createComponent(GalleryLightbox);
    fixture.componentRef.setInput(
      'photos',
      ['a', 'b', 'c'].map((id) => ({ id, width: 800, height: 600 })),
    );
    fixture.componentRef.setInput('salonName', 'Studio Kora');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const dialog = el.querySelector('dialog') as HTMLDialogElement;
    const large = () => dialog.querySelector<HTMLImageElement>('img.large');
    const click = (selector: string) => {
      el.querySelector<HTMLElement>(selector)?.click();
      fixture.detectChanges();
    };
    return { el, dialog, large, click, fixture };
  }

  it('shows every photo as a thumbnail with its size, loaded lazily', () => {
    const { el } = setup();

    const thumbs = [...el.querySelectorAll('.thumb img')];
    expect(thumbs.map((img) => img.getAttribute('alt'))).toEqual([
      'Studio Kora: zdjęcie 1 z 3',
      'Studio Kora: zdjęcie 2 z 3',
      'Studio Kora: zdjęcie 3 z 3',
    ]);
    expect(thumbs[0].getAttribute('loading')).toBe('lazy');
    expect(thumbs[0].getAttribute('width')).toBe('800');
  });

  it('opens the clicked photo large and steps around the ends', () => {
    const { dialog, large, click } = setup();
    expect(large()).toBeNull();

    click('li:nth-child(3) .thumb');

    expect(dialog.open).toBe(true);
    expect(large()?.getAttribute('src')).toBe('/api/public/photos/c');
    click('button[aria-label="Następne zdjęcie"]');
    expect(large()?.getAttribute('src')).toBe('/api/public/photos/a');
    click('button[aria-label="Poprzednie zdjęcie"]');
    expect(large()?.getAttribute('src')).toBe('/api/public/photos/c');
  });

  it('closes with the close button', () => {
    const { dialog, large, click, fixture } = setup();
    click('li:nth-child(1) .thumb');

    click('button[aria-label="Zamknij"]');
    fixture.detectChanges();

    expect(dialog.open).toBe(false);
    expect(large()).toBeNull();
  });
});

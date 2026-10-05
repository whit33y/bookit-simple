import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import {
  addressLine,
  DEFAULT_ACCENT_COLOR,
  formatPhone,
  formatPrice,
  photoUrl,
  WEEKDAY_NAMES,
} from '@bookit/shared';
import { GalleryLightbox } from './gallery-lightbox';
import { PageHead } from './page-head';
import { formatDuration, onAccentColor, warsawWeekday } from './page-text';
import { PublicPageResult } from './public-page-data';
import { NotFoundPage, PageUnavailable } from './status-pages';

/**
 * The Wizytówka (`/:slug`), rendered on the server for Klienci and Google. Its own light
 * styles, no Angular Material. Sections in the order of docs/mvp.md; one the Właściciel
 * turned off, or one with nothing to show, is left out.
 */
@Component({
  selector: 'app-public-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GalleryLightbox, NotFoundPage, PageUnavailable],
  templateUrl: './public-page.html',
  styleUrl: './public-page.scss',
  host: {
    '[style.--accent]': 'accent()',
    '[style.--on-accent]': 'onAccent()',
  },
})
export class PublicPageView {
  /** From `publicPageResolver`. */
  readonly page = input.required<PublicPageResult>();

  protected readonly data = computed(() => {
    const page = this.page();
    return typeof page === 'object' ? page : null;
  });
  protected readonly unavailable = computed(
    () => this.page() === 'unavailable',
  );

  protected readonly accent = computed(
    () => this.data()?.salon.accentColor ?? DEFAULT_ACCENT_COLOR,
  );
  protected readonly onAccent = computed(() => onAccentColor(this.accent()));

  protected readonly address = computed(() => {
    const salon = this.data()?.salon;
    return salon ? addressLine(salon) : '';
  });

  /** All seven days, a missing one closed, today in Europe/Warsaw marked. */
  protected readonly week = computed(() => {
    const hours = this.data()?.openingHours ?? [];
    const today = warsawWeekday(new Date());
    return WEEKDAY_NAMES.map((name, i) => {
      const day = hours.find((h) => h.weekday === i + 1);
      return {
        name,
        hours: day ? `${day.opensAt}–${day.closesAt}` : null,
        today: today === i + 1,
      };
    });
  });

  protected readonly photoUrl = photoUrl;
  protected readonly formatPhone = formatPhone;
  protected readonly formatPrice = formatPrice;
  protected readonly formatDuration = formatDuration;

  constructor() {
    const head = inject(PageHead);
    effect(() => {
      const page = this.data();
      if (page) head.show(page);
    });
  }
}

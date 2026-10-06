import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { addressLine, formatPhone } from '@bookit/shared';
import { PageHead } from '../page-head';
import { paragraphs } from '../page-text';
import { PublicPageResult } from '../public-page-data';
import { NotFoundPage } from '../not-found-page/not-found-page';
import { PageUnavailable } from '../page-unavailable/page-unavailable';

/**
 * `/:slug/prywatnosc`, rendered on the server: the klauzula RODO the Właściciel wrote,
 * as plain text in paragraphs, with the data of the Salon as the administrator.
 */
@Component({
  selector: 'app-privacy-notice-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NotFoundPage, PageUnavailable],
  templateUrl: './privacy-notice-page.html',
  styleUrl: './privacy-notice-page.scss',
})
export class PrivacyNoticePage {
  /** From `publicPageResolver`. */
  readonly page = input.required<PublicPageResult>();

  protected readonly data = computed(() => {
    const page = this.page();
    return typeof page === 'object' ? page : null;
  });
  protected readonly unavailable = computed(
    () => this.page() === 'unavailable',
  );

  protected readonly paragraphs = computed(() =>
    paragraphs(this.data()?.privacyNotice ?? null),
  );
  protected readonly address = computed(() => {
    const salon = this.data()?.salon;
    return salon ? addressLine(salon) : '';
  });

  protected readonly formatPhone = formatPhone;

  constructor() {
    const head = inject(PageHead);
    effect(() => {
      const page = this.data();
      if (page) head.showPrivacyNotice(page);
    });
  }
}

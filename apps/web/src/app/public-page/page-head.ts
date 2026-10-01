import { DOCUMENT } from '@angular/common';
import { inject, Injectable, REQUEST } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { photoUrl, PublicPage } from '@bookit/shared';
import { pageDescription, salonJsonLd } from './page-text';

/** `<head>` of the Wizytówka and its subpages for Google and link previews. */
@Injectable({ providedIn: 'root' })
export class PageHead {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });

  /** The Wizytówka: title, description, Open Graph, JSON-LD. */
  show(page: PublicPage): void {
    const { salon } = page;
    const origin = this.origin();
    const url = `${origin}/${salon.slug}`;
    const title = salon.city ? `${salon.name} – ${salon.city}` : salon.name;
    const description = pageDescription(salon, page.sections);

    this.title.setTitle(title);
    this.setMeta('name', 'description', description);
    this.setMeta('property', 'og:type', 'website');
    this.setMeta('property', 'og:locale', 'pl_PL');
    this.setMeta('property', 'og:title', title);
    this.setMeta('property', 'og:description', description);
    this.setMeta('property', 'og:url', url);
    const hero = salon.hero;
    this.setMeta(
      'property',
      'og:image',
      hero && `${origin}${photoUrl(hero.id)}`,
    );
    this.setMeta('property', 'og:image:width', hero && `${hero.width}`);
    this.setMeta('property', 'og:image:height', hero && `${hero.height}`);

    this.setCanonical(url);
    // `<` escaped, so no text from the Salon can close the script tag.
    this.headElement('script', 'type="application/ld+json"', {
      type: 'application/ld+json',
    }).textContent = JSON.stringify(salonJsonLd(page, origin)).replace(
      /</g,
      '\\u003c',
    );
  }

  /** `/:slug/prywatnosc`, the klauzula RODO: title, description and its own address. */
  showPrivacyNotice(page: PublicPage): void {
    const { salon } = page;
    this.title.setTitle(`Polityka prywatności · ${salon.name}`);
    this.setMeta(
      'name',
      'description',
      `Klauzula informacyjna RODO dla Klientów Salonu ${salon.name}.`,
    );
    this.setCanonical(`${this.origin()}/${salon.slug}/prywatnosc`);
  }

  private setCanonical(url: string): void {
    this.headElement('link', 'rel="canonical"', {
      rel: 'canonical',
    }).setAttribute('href', url);
  }

  /** Where the page is served: from the request on the server, the address bar in the browser. */
  private origin(): string {
    return this.request
      ? new URL(this.request.url).origin
      : this.document.location.origin;
  }

  private setMeta(
    attr: 'name' | 'property',
    key: string,
    content: string | null,
  ) {
    const selector = `${attr}="${key}"`;
    if (content) this.meta.updateTag({ [attr]: key, content }, selector);
    else this.meta.removeTag(selector);
  }

  /** The one `<tag selector>` in `<head>`, added on the server and found again after hydration. */
  private headElement(
    tag: 'link' | 'script',
    selector: string,
    attributes: Record<string, string>,
  ): Element {
    const head = this.document.head;
    const found = head.querySelector(`${tag}[${selector}]`);
    if (found) return found;
    const element = this.document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    head.appendChild(element);
    return element;
  }
}

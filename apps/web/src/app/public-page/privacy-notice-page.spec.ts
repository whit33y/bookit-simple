import { DOCUMENT } from '@angular/common';
import { RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { ALL_PAGE_SECTIONS, PublicPage } from '@bookit/shared';
import { PublicPageResult } from './public-page-data';
import { PrivacyNoticePage } from './privacy-notice-page';

const PAGE: PublicPage = {
  salon: {
    name: 'Studio Kora',
    slug: 'studio-kora',
    about: null,
    street: 'ul. Długa 12',
    postalCode: '31-147',
    city: 'Kraków',
    phone: '+48600100200',
    email: 'kontakt@kora.test',
    mapUrl: null,
    accentColor: '#f1c40f',
    headerLayout: 'CLASSIC',
    logo: null,
    hero: null,
  },
  sections: ALL_PAGE_SECTIONS,
  categories: [],
  announcements: [],
  staff: [],
  gallery: [],
  openingHours: [],
  privacyNotice:
    'Administratorem danych jest Studio Kora.\n\nPrzetwarzamy imię\ni numer telefonu.',
};

describe('PrivacyNoticePage', () => {
  function setup(page: PublicPageResult) {
    const responseInit: ResponseInit = {};
    TestBed.configureTestingModule({
      providers: [{ provide: RESPONSE_INIT, useValue: responseInit }],
    });
    const fixture = TestBed.createComponent(PrivacyNoticePage);
    fixture.componentRef.setInput('page', page);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const head = TestBed.inject(DOCUMENT).head;
    return { el, head, responseInit };
  }

  afterEach(() => {
    TestBed.inject(DOCUMENT)
      .head.querySelectorAll('link[rel="canonical"]')
      .forEach((node) => node.remove());
  });

  it('shows the notice in paragraphs', () => {
    const { el, responseInit } = setup(PAGE);

    expect(el.querySelector('h1')?.textContent).toContain(
      'Polityka prywatności',
    );
    expect(
      [...el.querySelectorAll('main .notice p')].map((p) => p.textContent),
    ).toEqual([
      'Administratorem danych jest Studio Kora.',
      'Przetwarzamy imię\ni numer telefonu.',
    ]);
    expect(responseInit.status).toBeUndefined();
  });

  it('shows the Salon data and links back to the Wizytówka', () => {
    const { el } = setup(PAGE);

    const text = el.textContent?.replace(/\s+/g, ' ');
    expect(text).toContain('Studio Kora');
    expect(text).toContain('ul. Długa 12, 31-147 Kraków');
    expect(
      el.querySelector('a[href="mailto:kontakt@kora.test"]'),
    ).not.toBeNull();
    expect(el.querySelector('a[href="tel:+48600100200"]')).not.toBeNull();
    expect(el.querySelector('a[href="/studio-kora"]')).not.toBeNull();
  });

  it('shows user text as text', () => {
    const { el } = setup({
      ...PAGE,
      privacyNotice: '<script>alert(1)</script>\n\n<b>pogrubione</b>',
    });

    expect(el.querySelector('main script')).toBeNull();
    expect(el.querySelector('main b')).toBeNull();
    expect(el.textContent).toContain('<script>alert(1)</script>');
    expect(el.textContent).toContain('<b>pogrubione</b>');
  });

  it('says when the Salon has not written the notice yet', () => {
    const { el } = setup({ ...PAGE, privacyNotice: null });

    expect(el.querySelector('main .notice')).toBeNull();
    expect(el.textContent).toContain('Salon nie dodał jeszcze');
  });

  it('fills the title and points the canonical link at this page', () => {
    const { head } = setup(PAGE);

    expect(TestBed.inject(Title).getTitle()).toBe(
      'Polityka prywatności · Studio Kora',
    );
    expect(
      head.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ).toMatch(/\/studio-kora\/prywatnosc$/);
  });

  it('answers 404 for an unknown address', () => {
    const { el, responseInit } = setup('not-found');

    expect(el.querySelector('h1')?.textContent).toContain(
      'Nie ma takiej strony',
    );
    expect(responseInit.status).toBe(404);
  });

  it('answers 503 when the api fails', () => {
    const { el, responseInit } = setup('unavailable');

    expect(el.textContent).toContain('chwilowo niedostępna');
    expect(responseInit.status).toBe(503);
  });
});

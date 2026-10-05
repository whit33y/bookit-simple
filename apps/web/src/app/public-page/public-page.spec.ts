import { DOCUMENT } from '@angular/common';
import { RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { ALL_PAGE_SECTIONS, PublicPage } from '@bookit/shared';
import { PublicPageResult } from './public-page-data';
import { PublicPageView } from './public-page';

const photo = (id: string) => ({ id, width: 800, height: 600 });

const PAGE: PublicPage = {
  salon: {
    name: 'Studio Kora',
    slug: 'studio-kora',
    about: 'Salon fryzjerski w Krakowie.\n\nZapraszamy!',
    street: 'ul. Długa 12',
    postalCode: '31-147',
    city: 'Kraków',
    phone: '+48600100200',
    email: 'kontakt@kora.test',
    mapUrl: 'https://maps.example/kora',
    accentColor: '#f1c40f',
    headerLayout: 'CLASSIC',
    logo: photo('logo-id'),
    hero: photo('hero-id'),
  },
  sections: ALL_PAGE_SECTIONS,
  categories: [
    {
      name: 'Strzyżenie',
      services: [
        {
          name: 'Strzyżenie damskie',
          description: 'Mycie, strzyżenie i modelowanie',
          priceGrosze: 9000,
          priceType: 'FROM',
          durationMin: 45,
        },
        {
          name: 'Strzyżenie męskie',
          description: null,
          priceGrosze: 6000,
          priceType: 'FIXED',
          durationMin: 30,
        },
      ],
    },
  ],
  announcements: [
    {
      title: 'Nowość: laminacja brwi',
      body: 'Do końca miesiąca -20%',
      photo: photo('promo-id'),
      showFrom: '2026-10-01',
      showUntil: '2026-10-31',
    },
  ],
  staff: [
    { displayName: 'Magda', bio: 'Fryzjerka', photo: photo('magda-id') },
    { displayName: 'Ola', bio: null, photo: null },
  ],
  gallery: [photo('g1'), photo('g2')],
  openingHours: [
    { weekday: 1, opensAt: '09:00', closesAt: '19:00' },
    { weekday: 6, opensAt: '09:00', closesAt: '15:00' },
  ],
  privacyNotice: 'Administratorem danych jest Studio Kora.',
};

describe('PublicPageView', () => {
  function setup(page: PublicPageResult, now = '2026-10-03T10:00:00Z') {
    const responseInit: ResponseInit = {};
    vi.useFakeTimers({ now: new Date(now), toFake: ['Date'] });
    TestBed.configureTestingModule({
      providers: [{ provide: RESPONSE_INIT, useValue: responseInit }],
    });
    const fixture = TestBed.createComponent(PublicPageView);
    fixture.componentRef.setInput('page', page);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const head = TestBed.inject(DOCUMENT).head;
    const section = (heading: string) =>
      [...el.querySelectorAll('section')].find(
        (s) => s.querySelector('h2')?.textContent?.trim() === heading,
      );
    const text = () => el.textContent?.replace(/\s+/g, ' ') ?? '';
    return { el, head, section, text, responseInit };
  }

  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(DOCUMENT)
      .head.querySelectorAll(
        'script[type="application/ld+json"], link[rel="canonical"]',
      )
      .forEach((node) => node.remove());
  });

  it('shows the header with name, logo, photo and a button to call', () => {
    const { el } = setup(PAGE);

    expect(el.querySelector('h1')?.textContent).toContain('Studio Kora');
    const call = el.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
    expect(call?.getAttribute('href')).toBe('tel:+48600100200');
    expect(call?.textContent).toContain('Zadzwoń');
    const hero = el.querySelector<HTMLImageElement>('header img.hero-photo');
    expect(hero?.getAttribute('src')).toBe('/api/public/photos/hero-id');
    expect(hero?.getAttribute('loading')).toBeNull();
    expect(el.querySelector('header img.logo')?.getAttribute('alt')).toBe(
      'Logo Studio Kora',
    );
  });

  it.each(['CLASSIC', 'PHOTO_SIDE', 'COMPACT'] as const)(
    'renders layout %s with unchanged sections and link preview',
    (headerLayout) => {
      const { el, head, section } = setup({
        ...PAGE,
        salon: { ...PAGE.salon, headerLayout },
      });
      const header = el.querySelector('header');
      expect(header?.classList.contains('photo-side')).toBe(
        headerLayout === 'PHOTO_SIDE',
      );
      expect(header?.classList.contains('compact')).toBe(
        headerLayout === 'COMPACT',
      );
      expect(el.querySelector('header .hero-photo') !== null).toBe(
        headerLayout !== 'COMPACT',
      );
      expect(el.querySelector('header .logo')).not.toBeNull();
      expect(el.querySelector('header .call')?.getAttribute('href')).toBe(
        'tel:+48600100200',
      );
      expect(el.querySelector('header')?.textContent).not.toContain(
        PAGE.salon.about,
      );
      expect(section('O nas')?.textContent).toContain(PAGE.salon.about);
      expect(section('Zespół')?.querySelector('img')?.getAttribute('src')).toBe(
        '/api/public/photos/magda-id',
      );
      expect(
        section('Zespół')?.querySelector('.initial')?.textContent,
      ).toContain('O');
      expect(
        head
          .querySelector('meta[property="og:image"]')
          ?.getAttribute('content'),
      ).toMatch(/hero-id$/);
      expect(
        [...el.querySelectorAll('section h2')].map((h) =>
          h.textContent?.trim(),
        ),
      ).toEqual([
        'Ogłoszenia',
        'O nas',
        'Cennik',
        'Zespół',
        'Galeria',
        'Godziny otwarcia',
        'Kontakt',
      ]);
    },
  );

  it.each(['CLASSIC', 'PHOTO_SIDE', 'COMPACT'] as const)(
    'leaves no empty optional header elements in %s',
    (headerLayout) => {
      const { el } = setup({
        ...PAGE,
        salon: {
          ...PAGE.salon,
          headerLayout,
          hero: null,
          logo: null,
          street: null,
          postalCode: null,
          city: null,
          phone: null,
        },
      });
      expect(el.querySelector('header img')).toBeNull();
      expect(el.querySelector('header .header-address')).toBeNull();
      expect(el.querySelector('header .call')).toBeNull();
      expect(el.querySelector('header')?.classList.contains('has-hero')).toBe(
        false,
      );
    },
  );

  it('shows the sections in the order of the Wizytówka', () => {
    const { el } = setup(PAGE);

    expect(
      [...el.querySelectorAll('section h2')].map((h) => h.textContent?.trim()),
    ).toEqual([
      'Ogłoszenia',
      'O nas',
      'Cennik',
      'Zespół',
      'Galeria',
      'Godziny otwarcia',
      'Kontakt',
    ]);
  });

  it('shows the Cennik by Kategorie with Cena, opis and czas', () => {
    const { section } = setup(PAGE);

    const pricing = section('Cennik')?.textContent?.replace(/\s+/g, ' ');
    expect(pricing).toContain('Strzyżenie');
    expect(pricing).toContain('Strzyżenie damskie');
    expect(pricing).toContain('od 90 zł');
    expect(pricing).toContain('Mycie, strzyżenie i modelowanie');
    expect(pricing).toContain('45 min');
    expect(pricing).toContain('60 zł');
  });

  it('leaves out the sections the Właściciel turned off', () => {
    const { section } = setup({
      ...PAGE,
      sections: { ...ALL_PAGE_SECTIONS, pricing: false, gallery: false },
    });

    expect(section('Cennik')).toBeUndefined();
    expect(section('Galeria')).toBeUndefined();
    expect(section('O nas')).toBeDefined();
  });

  it('leaves out an empty section', () => {
    const { section } = setup({ ...PAGE, announcements: [], staff: [] });

    expect(section('Ogłoszenia')).toBeUndefined();
    expect(section('Zespół')).toBeUndefined();
  });

  it('shows every weekday and marks today in Europe/Warsaw', () => {
    // Saturday
    const { section } = setup(PAGE, '2026-10-03T10:00:00Z');

    const rows = [
      ...(section('Godziny otwarcia')?.querySelectorAll('tr') ?? []),
    ];
    expect(rows).toHaveLength(7);
    expect(rows[0].textContent).toContain('09:00–19:00');
    expect(rows[1].textContent).toContain('Zamknięte');
    const today = rows.filter((row) => row.classList.contains('today'));
    expect(today).toHaveLength(1);
    expect(today[0].textContent).toContain('Sobota');
    expect(today[0].getAttribute('aria-current')).toBe('date');
  });

  it('shows the address with a link to the map', () => {
    const { section } = setup(PAGE);

    const contact = section('Kontakt');
    expect(contact?.textContent).toContain('ul. Długa 12, 31-147 Kraków');
    expect(
      contact?.querySelector('a[href="https://maps.example/kora"]'),
    ).not.toBeNull();
  });

  it('loads photos below the header lazily, with their size', () => {
    const { el } = setup(PAGE);

    const below = [...el.querySelectorAll('main img')];
    expect(below.length).toBeGreaterThan(0);
    for (const img of below) {
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('width')).toBe('800');
      expect(img.getAttribute('height')).toBe('600');
    }
  });

  it('sets the accent colour and readable text on it', () => {
    const { el } = setup(PAGE);

    const host = el as HTMLElement;
    expect(host.style.getPropertyValue('--accent')).toBe('#f1c40f');
    expect(host.style.getPropertyValue('--on-accent')).toBe('#000000');
  });

  it('links the privacy notice in the footer', () => {
    const { el } = setup(PAGE);

    expect(
      el.querySelector('footer a[href="/studio-kora/prywatnosc"]')?.textContent,
    ).toContain('Polityka prywatności');
  });

  it('shows user text as text', () => {
    const { el } = setup({
      ...PAGE,
      salon: { ...PAGE.salon, about: '<script>alert(1)</script>' },
    });

    expect(el.querySelector('main script')).toBeNull();
    expect(el.textContent).toContain('<script>alert(1)</script>');
  });

  it('fills the title, description, Open Graph and JSON-LD', () => {
    const { head } = setup(PAGE);

    expect(TestBed.inject(Title).getTitle()).toBe('Studio Kora – Kraków');
    const meta = (selector: string) =>
      head.querySelector(`meta[${selector}]`)?.getAttribute('content');
    expect(meta('name="description"')).toBe(
      'Salon fryzjerski w Krakowie. Zapraszamy!',
    );
    expect(meta('property="og:title"')).toBe('Studio Kora – Kraków');
    expect(meta('property="og:image"')).toMatch(
      /\/api\/public\/photos\/hero-id$/,
    );
    const scripts = head.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    const ld = JSON.parse(scripts[0].textContent ?? '');
    expect(ld['@type']).toBe('BeautySalon');
    expect(ld.telephone).toBe('+48600100200');
  });

  it('keeps JSON-LD from closing its script tag', () => {
    const { head } = setup({
      ...PAGE,
      salon: { ...PAGE.salon, about: '</script><script>alert(1)</script>' },
    });

    const script = head.querySelector('script[type="application/ld+json"]');
    expect(script?.textContent).not.toContain('</script>');
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

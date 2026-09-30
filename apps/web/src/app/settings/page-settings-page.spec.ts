import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import {
  ALL_PAGE_SECTIONS,
  MAP_URL_INVALID,
  SalonPageSettings,
} from '@bookit/shared';
import { PageSettingsPage } from './page-settings-page';

const URL = '/api/salon/page';
const SALON: SalonPageSettings = {
  name: 'Studio Kora',
  slug: 'studio-kora',
  about: 'Salon w centrum Łodzi',
  street: 'ul. Piotrkowska 120',
  postalCode: '90-006',
  city: 'Łódź',
  phone: '+48600123456',
  email: 'kontakt@studiokora.pl',
  mapUrl: 'https://maps.app.goo.gl/abc123',
  accentColor: '#6750a4',
  logoPhotoId: null,
  heroPhotoId: null,
  sections: ALL_PAGE_SECTIONS,
  privacyNotice: null,
};

describe('PageSettingsPage', () => {
  async function setup(salon: SalonPageSettings = SALON) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Tabs attach their content when the animation ends.
        {
          provide: MATERIAL_ANIMATIONS,
          useValue: { animationsDisabled: true },
        },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PageSettingsPage);
    fixture.detectChanges();
    http.expectOne(URL).flush(salon);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const field = <T extends HTMLElement>(label: string) => {
      const found = [...el.querySelectorAll('mat-form-field')].find(
        (f) => f.querySelector('mat-label')?.textContent?.trim() === label,
      );
      const control = found?.querySelector<T>('input, textarea');
      if (!control) throw new Error(`No field "${label}"`);
      return control as T & HTMLInputElement;
    };
    const type = (label: string, value: string) => {
      const control = field(label);
      control.value = value;
      control.dispatchEvent(new Event('input'));
    };
    const tab = async (label: string) => {
      const found = [...el.querySelectorAll<HTMLElement>('[role="tab"]')].find(
        (t) => t.textContent?.trim() === label,
      );
      if (!found) throw new Error(`No tab "${label}"`);
      found.click();
      await settle();
    };
    const button = (text: string) => {
      const found = [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes(text),
      );
      if (!found) throw new Error(`No button "${text}"`);
      return found;
    };
    const submit = async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    const text = () => el.textContent ?? '';
    return { http, el, settle, field, type, tab, button, submit, text };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('fills the Dane tab and links to the Wizytówka in a new tab', async () => {
    const { el, field } = await setup();

    expect(field('O nas').value).toBe('Salon w centrum Łodzi');
    expect(field('Telefon').value).toBe('+48 600 123 456');
    expect(field('Link do mapy').value).toBe('https://maps.app.goo.gl/abc123');
    const link = [...el.querySelectorAll('a')].find((a) =>
      a.textContent?.includes('Otwórz Wizytówkę'),
    );
    expect(link?.getAttribute('href')).toBe('/studio-kora');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('saves every tab at once', async () => {
    const { http, el, type, tab, submit, settle, text } = await setup();

    type('Miasto', 'Pabianice');
    await tab('Wygląd');
    type('Kolor akcentu', '#c0392b');
    await tab('Sekcje');
    const toggles = [
      ...el.querySelectorAll<HTMLButtonElement>('button[role="switch"]'),
    ];
    expect(toggles).toHaveLength(7);
    toggles
      .find((t) =>
        t.closest('mat-slide-toggle')?.textContent?.includes('Galeria'),
      )
      ?.click();
    await settle();
    await submit();

    const req = http.expectOne({ url: URL, method: 'PATCH' });
    expect(req.request.body).toEqual({
      about: 'Salon w centrum Łodzi',
      street: 'ul. Piotrkowska 120',
      postalCode: '90-006',
      city: 'Pabianice',
      phone: '+48 600 123 456',
      email: 'kontakt@studiokora.pl',
      mapUrl: 'https://maps.app.goo.gl/abc123',
      accentColor: '#c0392b',
      logoPhotoId: null,
      heroPhotoId: null,
      sections: { ...ALL_PAGE_SECTIONS, gallery: false },
      privacyNotice: '',
    });
    req.flush({ ...SALON, city: 'Pabianice' });
    await settle();
    expect(text()).toContain('Zapisano Wizytówkę');
  });

  it.each(['javascript:alert(1)', 'http://maps.google.com'])(
    'does not save the map link %s and opens the Dane tab',
    async (mapUrl) => {
      const { type, tab, submit, text } = await setup();

      type('Link do mapy', mapUrl);
      await tab('Prywatność');
      await submit();

      expect(text()).toContain(MAP_URL_INVALID);
      expect(text()).toContain('Popraw zaznaczone pola');
    },
  );

  it('fills the privacy notice from the template with the Salon data', async () => {
    const { tab, button, settle, field } = await setup();

    await tab('Prywatność');
    button('Wstaw szablon').click();
    await settle();

    const notice = field('Klauzula informacyjna').value;
    expect(notice).toContain(
      'Administratorem Twoich danych osobowych jest Studio Kora, ul. Piotrkowska 120, 90-006 Łódź.',
    );
    expect(notice).toContain('kontakt@studiokora.pl');
  });

  it('shows the message of a refused save', async () => {
    const { http, submit, settle, text } = await setup();

    await submit();
    http
      .expectOne({ url: URL, method: 'PATCH' })
      .flush(
        { message: MAP_URL_INVALID, error: 'Unprocessable Entity' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await settle();

    expect(text()).toContain(MAP_URL_INVALID);
  });

  it('keeps what is typed in a tab opened again', async () => {
    const { http, type, tab, submit } = await setup();

    await tab('Prywatność');
    await tab('Dane');
    type('Miasto', 'Pabianice');
    await tab('Wygląd');
    await submit();

    const req = http.expectOne({ url: URL, method: 'PATCH' });
    expect(req.request.body.city).toBe('Pabianice');
    req.flush(SALON);
  });
});

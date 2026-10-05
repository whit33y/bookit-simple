import { DEFAULT_PAGE_SECTION_ORDER } from '@bookit/shared';
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
  headerLayout: 'CLASSIC',
  accentColor: '#6750a4',
  logoPhotoId: null,
  heroPhotoId: null,
  sectionOrder: DEFAULT_PAGE_SECTION_ORDER,
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

  it('reorders disabled sections locally, keeps a failed draft and saves on retry', async () => {
    const { el, http, tab, settle, submit } = await setup({
      ...SALON,
      sections: { ...ALL_PAGE_SECTIONS, about: false },
    });
    await tab('Sekcje');
    const move = (label: string) =>
      el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    expect(move('W górę: Ogłoszenia').disabled).toBe(true);
    expect(move('W dół: Kontakt').disabled).toBe(true);
    move('W górę: O nas').click();
    await settle();
    expect(
      el.querySelector('.sections li mat-slide-toggle')?.textContent?.trim(),
    ).toBe('O nas');
    // "W górę" is now disabled, so focus moves to the section's other button.
    expect(document.activeElement).toBe(move('W dół: O nas'));
    http.expectNone({ url: URL, method: 'PATCH' });
    await submit();
    const req = http.expectOne({ url: URL, method: 'PATCH' });
    const order = [
      'about',
      'announcements',
      'pricing',
      'team',
      'gallery',
      'hours',
      'contact',
    ];
    expect(req.request.body.sectionOrder).toEqual(order);
    expect(req.request.body.sections.about).toBe(false);
    req.flush({}, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(
      el.querySelector('.sections li mat-slide-toggle')?.textContent?.trim(),
    ).toBe('O nas');
    await submit();
    const retry = http.expectOne({ url: URL, method: 'PATCH' });
    expect(retry.request.body.sectionOrder).toEqual(order);
    retry.flush({ ...SALON, sectionOrder: order });
    await settle();
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
      headerLayout: 'CLASSIC',
      accentColor: '#c0392b',
      logoPhotoId: null,
      heroPhotoId: null,
      sectionOrder: DEFAULT_PAGE_SECTION_ORDER,
      sections: { ...ALL_PAGE_SECTIONS, gallery: false },
      privacyNotice: '',
    });
    req.flush({ ...SALON, city: 'Pabianice' });
    await settle();
    expect(text()).toContain('Zapisano Wizytówkę');
  });

  it.each(['CLASSIC', 'PHOTO_SIDE', 'COMPACT'] as const)(
    'loads and saves layout %s through the shared form',
    async (headerLayout) => {
      const { el, http, tab, settle, submit } = await setup({
        ...SALON,
        headerLayout,
      });
      await tab('Wygląd');
      const selected = el.querySelector<HTMLInputElement>(
        `input[type="radio"][value="${headerLayout}"]`,
      );
      expect(selected?.checked).toBe(true);
      const next = headerLayout === 'COMPACT' ? 'CLASSIC' : 'COMPACT';
      el.querySelector<HTMLInputElement>(
        `input[type="radio"][value="${next}"]`,
      )?.click();
      await settle();
      http.expectNone({ url: URL, method: 'PATCH' });
      await submit();
      const save = http.expectOne({ url: URL, method: 'PATCH' });
      expect(save.request.body.headerLayout).toBe(next);
      save.flush({ ...SALON, headerLayout: next });
      await settle();
      expect(
        el.querySelector<HTMLInputElement>(
          `input[type="radio"][value="${next}"]`,
        )?.checked,
      ).toBe(true);
    },
  );

  it('keeps the draft layout after a refused save and allows retry', async () => {
    const { el, http, tab, settle, submit, text } = await setup();
    await tab('Wygląd');
    el.querySelector<HTMLInputElement>(
      'input[type="radio"][value="COMPACT"]',
    )?.click();
    await settle();
    await submit();
    http
      .expectOne({ url: URL, method: 'PATCH' })
      .flush(
        { message: 'Błąd zapisu' },
        { status: 500, statusText: 'Server Error' },
      );
    await settle();
    expect(text()).toContain('Wystąpił błąd serwera');
    expect(
      el.querySelector<HTMLInputElement>('input[type="radio"][value="COMPACT"]')
        ?.checked,
    ).toBe(true);
    await submit();
    const retry = http.expectOne({ url: URL, method: 'PATCH' });
    expect(retry.request.body.headerLayout).toBe('COMPACT');
    retry.flush({ ...SALON, headerLayout: 'COMPACT' });
  });

  it('fills the map link from the address while it is generated or empty', async () => {
    const { type, field } = await setup({
      ...SALON,
      mapUrl: 'https://www.google.com/maps/search/?api=1&query=old',
    });

    type('Miasto', 'Pabianice');
    expect(field('Link do mapy').value).toBe(
      'https://www.google.com/maps/search/?api=1&query=ul.%20Piotrkowska%20120%2C%2090-006%20Pabianice',
    );

    type('Link do mapy', '');
    type('Ulica i numer', '');
    expect(field('Link do mapy').value).toBe(
      'https://www.google.com/maps/search/?api=1&query=90-006%20Pabianice',
    );

    type('Kod pocztowy', '');
    type('Miasto', '');
    expect(field('Link do mapy').value).toBe('');
  });

  it('keeps a pasted map link when the address changes', async () => {
    const { type, field } = await setup();

    type('Miasto', 'Pabianice');

    expect(field('Link do mapy').value).toBe('https://maps.app.goo.gl/abc123');
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

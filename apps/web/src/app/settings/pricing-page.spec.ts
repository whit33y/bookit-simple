import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  SERVICE_CATEGORY_HAS_SERVICES,
  ServiceCategoryView,
} from '@bookit/shared';
import { PricingPage } from './pricing-page';

const HAIR: ServiceCategoryView = { id: 'c1', name: 'Strzyżenie' };
const NAILS: ServiceCategoryView = { id: 'c2', name: 'Paznokcie' };

describe('PricingPage', () => {
  async function setup(categories: ServiceCategoryView[] = [HAIR, NAILS]) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PricingPage);
    fixture.detectChanges();
    http.expectOne('/api/service-categories').flush(categories);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    if (categories.length > 0) {
      http.expectOne('/api/services?includeArchived=true').flush([]);
      await settle();
    }
    const page = fixture.componentInstance as unknown as {
      drop(event: Partial<CdkDragDrop<unknown>>): Promise<void>;
    };
    const button = (label: string) => {
      const found = el.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      );
      if (!found) throw new Error(`No button "${label}"`);
      return found;
    };
    const type = (label: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"]`,
      );
      if (!input) throw new Error(`No field "${label}"`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const submit = async (form: string) => {
      el.querySelector(`form[aria-label="${form}"]`)?.dispatchEvent(
        new Event('submit'),
      );
      await settle();
    };
    const names = () =>
      [...el.querySelectorAll('.row .name')].map((n) => n.textContent?.trim());
    const text = () => el.textContent ?? '';
    return { http, el, page, settle, button, type, submit, names, text };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('lists the Kategorie in order', async () => {
    const { names } = await setup();

    expect(names()).toEqual(['Strzyżenie', 'Paznokcie']);
  });

  it('says there are no Kategorie yet', async () => {
    const { text } = await setup([]);

    expect(text()).toContain('Nie ma jeszcze Kategorii');
  });

  it('adds a Kategoria at the end and clears the field', async () => {
    const { http, type, submit, settle, names, el } = await setup();

    type('Nazwa nowej Kategorii', ' Koloryzacja ');
    await submit('Dodaj Kategorię');
    const req = http.expectOne({
      url: '/api/service-categories',
      method: 'POST',
    });
    expect(req.request.body).toEqual({ name: 'Koloryzacja' });
    req.flush({ id: 'c3', name: 'Koloryzacja' });
    await settle();

    expect(names()).toEqual(['Strzyżenie', 'Paznokcie', 'Koloryzacja']);
    expect(
      el.querySelector<HTMLInputElement>(
        'input[aria-label="Nazwa nowej Kategorii"]',
      )?.value,
    ).toBe('');
  });

  it('does not send an empty name', async () => {
    const { submit, text } = await setup();

    await submit('Dodaj Kategorię');

    expect(text()).toContain('Wpisz nazwę');
  });

  it('renames a Kategoria in place', async () => {
    const { http, button, type, submit, settle, names } = await setup();

    button('Zmień nazwę: Paznokcie').click();
    await settle();
    type('Nazwa Kategorii', 'Manicure');
    await submit('Zmień nazwę Kategorii');
    const req = http.expectOne({
      url: '/api/service-categories/c2',
      method: 'PATCH',
    });
    expect(req.request.body).toEqual({ name: 'Manicure' });
    req.flush({ id: 'c2', name: 'Manicure' });
    await settle();

    expect(names()).toEqual(['Strzyżenie', 'Manicure']);
  });

  it('leaves the name as it was on cancel', async () => {
    const { button, type, settle, names } = await setup();

    button('Zmień nazwę: Paznokcie').click();
    await settle();
    type('Nazwa Kategorii', 'Manicure');
    button('Anuluj').click();
    await settle();

    expect(names()).toEqual(['Strzyżenie', 'Paznokcie']);
  });

  it('deletes a Kategoria without Usługi', async () => {
    const { http, button, settle, names } = await setup();

    button('Usuń: Paznokcie').click();
    http
      .expectOne({ url: '/api/service-categories/c2', method: 'DELETE' })
      .flush(null);
    await settle();

    expect(names()).toEqual(['Strzyżenie']);
  });

  it('keeps a Kategoria with Usługi and says why', async () => {
    const { http, button, settle, names, el } = await setup();

    button('Usuń: Paznokcie').click();
    http
      .expectOne({ url: '/api/service-categories/c2', method: 'DELETE' })
      .flush(
        { message: SERVICE_CATEGORY_HAS_SERVICES, error: 'Conflict' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();

    expect(names()).toEqual(['Strzyżenie', 'Paznokcie']);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      SERVICE_CATEGORY_HAS_SERVICES,
    );
  });

  it('saves the order after a drop and puts it back when saving fails', async () => {
    const { http, page, settle, names, text } = await setup();

    const dropped = page.drop({ previousIndex: 1, currentIndex: 0 });
    await settle();
    expect(names()).toEqual(['Paznokcie', 'Strzyżenie']);
    const req = http.expectOne({
      url: '/api/service-categories/order',
      method: 'PUT',
    });
    expect(req.request.body).toEqual({ ids: ['c2', 'c1'] });
    req.flush(null);
    await dropped;

    const failed = page.drop({ previousIndex: 1, currentIndex: 0 });
    http
      .expectOne('/api/service-categories/order')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await failed;
    await settle();

    expect(names()).toEqual(['Paznokcie', 'Strzyżenie']);
    expect(text()).toContain('Wystąpił błąd serwera');
  });
});

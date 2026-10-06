import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ServiceCategoryView, ServiceView } from '@bookit/shared';
import { of } from 'rxjs';
import { ArchiveServiceDialog } from '../archive-service-dialog/archive-service-dialog';
import { PricingServices } from './pricing-services';
import { ServiceDialog } from '../service-dialog/service-dialog';

const HAIR: ServiceCategoryView = { id: 'c1', name: 'Strzyżenie' };
const NAILS: ServiceCategoryView = { id: 'c2', name: 'Paznokcie' };

const service = (fields: Partial<ServiceView>): ServiceView => ({
  id: 's',
  categoryId: 'c1',
  name: 'Usługa',
  description: null,
  priceGrosze: 8000,
  priceType: 'FIXED',
  durationMin: 45,
  breakMin: 0,
  hidden: false,
  archived: false,
  ...fields,
});

const WOMEN = service({
  id: 's1',
  name: 'Damskie',
  priceGrosze: 9000,
  priceType: 'FROM',
  breakMin: 10,
});
const MEN = service({ id: 's2', name: 'Męskie', priceGrosze: 7950 });
const OLD = service({ id: 's3', name: 'Trwała', archived: true });
const MANICURE = service({
  id: 's4',
  categoryId: 'c2',
  name: 'Manicure',
  hidden: true,
});

describe('PricingServices', () => {
  async function setup(
    services: ServiceView[] = [WOMEN, MEN, OLD, MANICURE],
    closeWith?: unknown,
  ) {
    const open = vi.fn(() => ({ afterClosed: () => of(closeWith) }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PricingServices);
    fixture.componentRef.setInput('categories', [HAIR, NAILS]);
    fixture.detectChanges();
    http.expectOne('/api/services?includeArchived=true').flush(services);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const section = fixture.componentInstance as unknown as {
      drop(
        category: ServiceCategoryView,
        event: Partial<CdkDragDrop<unknown>>,
      ): Promise<void>;
    };
    const button = (label: string) => {
      const found = el.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      );
      if (!found) throw new Error(`No button "${label}"`);
      return found;
    };
    const names = (categoryId: string) =>
      [
        ...el.querySelectorAll(
          `[data-category="${categoryId}"] .service .name`,
        ),
      ].map((n) => n.textContent?.trim());
    const text = () => el.textContent ?? '';
    const showArchived = async () => {
      el.querySelector<HTMLButtonElement>(
        'mat-slide-toggle[data-filter="archived"] button',
      )?.click();
      await settle();
    };
    return {
      http,
      open,
      el,
      section,
      settle,
      button,
      names,
      text,
      showArchived,
    };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('groups the Usługi by Kategoria, with the Cena, time and Przerwa', async () => {
    const { names, text } = await setup();

    expect(names('c1')).toEqual(['Damskie', 'Męskie']);
    expect(names('c2')).toEqual(['Manicure']);
    expect(text()).toContain('od 90 zł');
    expect(text()).toContain('79,50 zł');
    expect(text()).toContain('45 min + 10 min Przerwy');
    expect(text()).toContain('Ukryta na Wizytówce');
  });

  it('shows archived Usługi only with the filter', async () => {
    const { names, showArchived, button } = await setup();

    expect(names('c1')).not.toContain('Trwała');

    await showArchived();

    expect(names('c1')).toEqual(['Damskie', 'Męskie', 'Trwała']);
    expect(button('Przywróć: Trwała')).toBeTruthy();
  });

  it('says a Kategoria has no Usługi yet', async () => {
    const { el } = await setup([WOMEN]);

    expect(el.querySelector('[data-category="c2"]')?.textContent).toContain(
      'Nie ma jeszcze Usług',
    );
  });

  it('does not call a Kategoria with only archived Usługi empty', async () => {
    const { el } = await setup([OLD]);

    const category = el.querySelector('[data-category="c1"]');
    expect(category?.textContent).not.toContain('Nie ma jeszcze Usług');
    expect(category?.querySelectorAll('.service')).toHaveLength(0);
  });

  it('adds the Usługa saved in the dialog to its Kategoria', async () => {
    const saved = service({ id: 's5', categoryId: 'c2', name: 'Pedicure' });
    const { button, open, settle, names } = await setup(undefined, saved);

    button('Dodaj Usługę do: Paznokcie').click();
    await settle();

    expect(open).toHaveBeenCalledWith(ServiceDialog, {
      data: { categories: [HAIR, NAILS], categoryId: 'c2' },
      autoFocus: 'dialog',
    });
    expect(names('c2')).toEqual(['Manicure', 'Pedicure']);
  });

  it('moves an edited Usługa to the end of its new Kategoria', async () => {
    const { button, settle, names } = await setup(undefined, {
      ...WOMEN,
      categoryId: 'c2',
    });

    button('Edytuj: Damskie').click();
    await settle();

    expect(names('c1')).toEqual(['Męskie']);
    expect(names('c2')).toEqual(['Manicure', 'Damskie']);
  });

  it('switches hiding on the Wizytówka', async () => {
    const { http, button, settle, text } = await setup([WOMEN]);

    button('Ukryj na Wizytówce: Damskie').click();
    const req = http.expectOne({ url: '/api/services/s1', method: 'PATCH' });
    expect(req.request.body).toEqual({ hidden: true });
    req.flush({ ...WOMEN, hidden: true });
    await settle();

    expect(text()).toContain('Ukryta na Wizytówce');
    expect(button('Pokaż na Wizytówce: Damskie')).toBeTruthy();
  });

  it('archives a Usługa after it is confirmed', async () => {
    const { http, open, button, settle, names } = await setup(undefined, true);

    button('Archiwizuj: Damskie').click();
    await settle();
    expect(open).toHaveBeenCalledWith(ArchiveServiceDialog, {
      data: { name: 'Damskie' },
    });
    http
      .expectOne({ url: '/api/services/s1/archive', method: 'POST' })
      .flush({ ...WOMEN, archived: true });
    await settle();

    expect(names('c1')).toEqual(['Męskie']);
  });

  it('does not archive without the confirmation', async () => {
    const { button, settle, names } = await setup(undefined, false);

    button('Archiwizuj: Damskie').click();
    await settle();

    expect(names('c1')).toEqual(['Damskie', 'Męskie']);
  });

  it('brings an archived Usługa back at the end of its Kategoria', async () => {
    const { http, button, settle, names, showArchived } = await setup();
    await showArchived();

    button('Przywróć: Trwała').click();
    http
      .expectOne({ url: '/api/services/s3/unarchive', method: 'POST' })
      .flush({ ...OLD, archived: false });
    await settle();

    expect(names('c1')).toEqual(['Damskie', 'Męskie', 'Trwała']);
    expect(() => button('Przywróć: Trwała')).toThrow();
  });

  it('saves the order within the Kategoria after a drop and puts it back when saving fails', async () => {
    const { http, section, settle, names, text } = await setup();

    const dropped = section.drop(HAIR, { previousIndex: 1, currentIndex: 0 });
    await settle();
    expect(names('c1')).toEqual(['Męskie', 'Damskie']);
    const req = http.expectOne({ url: '/api/services/order', method: 'PUT' });
    expect(req.request.body).toEqual({ categoryId: 'c1', ids: ['s2', 's1'] });
    req.flush(null);
    await dropped;

    const failed = section.drop(HAIR, { previousIndex: 1, currentIndex: 0 });
    http
      .expectOne('/api/services/order')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await failed;
    await settle();

    expect(names('c1')).toEqual(['Męskie', 'Damskie']);
    expect(text()).toContain('Wystąpił błąd serwera');
  });
});

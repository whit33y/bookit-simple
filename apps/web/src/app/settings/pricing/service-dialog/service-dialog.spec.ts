import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  SERVICE_BREAK_INVALID,
  SERVICE_DURATION_INVALID,
  SERVICE_NAME_TAKEN,
  SERVICE_PRICE_INVALID,
  ServiceView,
} from '@bookit/shared';
import { ServiceDialog, ServiceDialogData } from './service-dialog';

const CATEGORIES = [
  { id: 'c1', name: 'Strzyżenie' },
  { id: 'c2', name: 'Paznokcie' },
];

const WOMEN: ServiceView = {
  id: 's1',
  categoryId: 'c1',
  name: 'Strzyżenie damskie',
  description: 'Cena zależy od długości włosów',
  priceGrosze: 7950,
  priceType: 'FROM',
  durationMin: 45,
  breakMin: 10,
  hidden: false,
  archived: false,
};

describe('ServiceDialog', () => {
  async function setup(data: ServiceDialogData) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ServiceDialog);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const { form } = fixture.componentInstance as unknown as {
      form: FormGroup;
    };
    const submit = async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    const text = () => el.textContent ?? '';
    return { http, close, el, form, settle, submit, text };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('adds a Usługa in the given Kategoria, with the Cena typed in złote', async () => {
    const { http, close, form, submit, settle } = await setup({
      categories: CATEGORIES,
      categoryId: 'c2',
    });

    expect(form.getRawValue()).toMatchObject({
      categoryId: 'c2',
      price: '',
      priceType: 'FIXED',
      breakMin: 0,
      hidden: false,
    });
    form.patchValue({
      name: ' Manicure hybrydowy ',
      price: '79,50',
      durationMin: 60,
      description: '  ',
    });
    await submit();

    const req = http.expectOne({ url: '/api/services', method: 'POST' });
    expect(req.request.body).toEqual({
      categoryId: 'c2',
      name: 'Manicure hybrydowy',
      description: null,
      priceGrosze: 7950,
      priceType: 'FIXED',
      durationMin: 60,
      breakMin: 0,
      hidden: false,
    });
    const saved = { ...WOMEN, id: 's2', categoryId: 'c2' };
    req.flush(saved);
    await settle();

    expect(close).toHaveBeenCalledWith(saved);
  });

  it('shows the Usługa being edited and saves it', async () => {
    const { http, close, form, submit, settle } = await setup({
      categories: CATEGORIES,
      service: WOMEN,
    });

    expect(form.getRawValue()).toEqual({
      categoryId: 'c1',
      name: 'Strzyżenie damskie',
      description: 'Cena zależy od długości włosów',
      price: '79,50',
      priceType: 'FROM',
      durationMin: 45,
      breakMin: 10,
      hidden: false,
    });
    form.patchValue({ price: '85', hidden: true });
    await submit();

    const req = http.expectOne({ url: '/api/services/s1', method: 'PATCH' });
    expect(req.request.body).toMatchObject({
      priceGrosze: 8500,
      hidden: true,
    });
    req.flush({ ...WOMEN, priceGrosze: 8500, hidden: true });
    await settle();

    expect(close).toHaveBeenCalledOnce();
  });

  it('does not send a wrong Cena, Czas trwania or Przerwa', async () => {
    const { form, submit, text } = await setup({
      categories: CATEGORIES,
      service: WOMEN,
    });

    form.patchValue({ price: '79,505', durationMin: 42, breakMin: 3 });
    await submit();

    expect(text()).toContain(SERVICE_PRICE_INVALID);
    expect(text()).toContain(SERVICE_DURATION_INVALID);
    expect(text()).toContain(SERVICE_BREAK_INVALID);
  });

  it('stays open with the message when the name is taken', async () => {
    const { http, close, el, submit, settle } = await setup({
      categories: CATEGORIES,
      service: WOMEN,
    });

    await submit();
    http
      .expectOne('/api/services/s1')
      .flush(
        { message: SERVICE_NAME_TAKEN, error: 'Conflict' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();

    expect(close).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      SERVICE_NAME_TAKEN,
    );
  });
});

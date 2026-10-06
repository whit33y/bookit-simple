import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  CLIENT_NOTES_HINT,
  CLIENT_PHONE_TAKEN,
  ClientPhoneTakenResponse,
  ClientView,
  PHONE_INVALID,
} from '@bookit/shared';
import { ClientDialog, ClientDialogData } from './client-dialog';

const URL = '/api/clients';

const ANNA: ClientView = {
  id: 'c1',
  name: 'Anna Nowak',
  phoneE164: '+48600100200',
  notes: 'Woli rano',
};

const taken = (clients: ClientView[]): ClientPhoneTakenResponse => ({
  statusCode: 409,
  error: 'Conflict',
  message: CLIENT_PHONE_TAKEN,
  clients,
});

describe('ClientDialog', () => {
  async function setup(data: ClientDialogData = {}) {
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
    const fixture = TestBed.createComponent(ClientDialog);
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
    const button = (text: string) => {
      const found = [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes(text),
      );
      if (!found) throw new Error(`No button "${text}"`);
      return found;
    };
    const text = () => el.textContent ?? '';
    return { http, close, el, form, settle, submit, button, text };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('adds a Klient without a phone and closes with it', async () => {
    const { http, close, form, submit, settle } = await setup();

    form.patchValue({ name: '  Ola  ', phone: ' ', notes: '' });
    await submit();

    const req = http.expectOne({ url: URL, method: 'POST' });
    expect(req.request.body).toEqual({ name: 'Ola', phone: null, notes: null });
    const saved: ClientView = { ...ANNA, name: 'Ola', phoneE164: null };
    req.flush(saved);
    await settle();

    expect(close).toHaveBeenCalledWith(saved);
  });

  it('always shows the hint about health information under Uwagi', async () => {
    const { text } = await setup();

    expect(text()).toContain(CLIENT_NOTES_HINT);
  });

  it('does not send a phone that cannot be parsed', async () => {
    const { form, submit, text } = await setup();

    form.patchValue({ name: 'Ola', phone: '600 100' });
    await submit();

    expect(text()).toContain(PHONE_INVALID);
  });

  it('warns about a taken phone and saves after "Zapisz mimo to"', async () => {
    const { http, close, form, submit, settle, button, text } = await setup();

    form.patchValue({ name: 'Anna 2', phone: '600 100 200' });
    await submit();
    http
      .expectOne({ url: URL, method: 'POST' })
      .flush(taken([ANNA]), { status: 409, statusText: 'Conflict' });
    await settle();

    expect(text()).toContain(CLIENT_PHONE_TAKEN);
    expect(text()).toContain('Anna Nowak');
    expect(text()).toContain('+48 600 100 200');

    button('Zapisz mimo to').click();
    await settle();
    const req = http.expectOne({ url: URL, method: 'POST' });
    expect(req.request.body).toEqual({
      name: 'Anna 2',
      phone: '600 100 200',
      notes: null,
      acceptDuplicatePhone: true,
    });
    req.flush({ ...ANNA, id: 'c2', name: 'Anna 2' });
    await settle();

    expect(close).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }));
  });

  it('drops the warning once the phone is changed', async () => {
    const { http, form, submit, settle, text } = await setup();

    form.patchValue({ name: 'Anna 2', phone: '600 100 200' });
    await submit();
    http
      .expectOne({ url: URL, method: 'POST' })
      .flush(taken([ANNA]), { status: 409, statusText: 'Conflict' });
    await settle();
    form.patchValue({ phone: '600 100 201' });
    await settle();

    expect(text()).not.toContain(CLIENT_PHONE_TAKEN);
  });

  it('offers the Klient with the phone when picking one is allowed', async () => {
    const { http, close, form, submit, settle, button } = await setup({
      canPickExisting: true,
    });

    form.patchValue({ name: 'Anna', phone: '600100200' });
    await submit();
    http
      .expectOne({ url: URL, method: 'POST' })
      .flush(taken([ANNA]), { status: 409, statusText: 'Conflict' });
    await settle();
    button('Wybierz').click();

    expect(close).toHaveBeenCalledWith(ANNA);
  });

  it('starts from the given name or phone', async () => {
    const { form } = await setup({ name: 'Łucja', phone: '600' });

    expect(form.getRawValue()).toEqual({
      name: 'Łucja',
      phone: '600',
      notes: '',
    });
  });

  it('edits a Klient, showing the phone in groups', async () => {
    const { http, close, form, submit, settle } = await setup({
      client: ANNA,
    });

    expect(form.getRawValue()).toEqual({
      name: 'Anna Nowak',
      phone: '+48 600 100 200',
      notes: 'Woli rano',
    });
    form.patchValue({ notes: '' });
    await submit();

    const req = http.expectOne({ url: `${URL}/c1`, method: 'PATCH' });
    expect(req.request.body).toEqual({
      name: 'Anna Nowak',
      phone: '+48 600 100 200',
      notes: null,
    });
    req.flush({ ...ANNA, notes: null });
    await settle();

    expect(close).toHaveBeenCalledWith({ ...ANNA, notes: null });
  });

  it('shows the error of the api in the dialog', async () => {
    const { http, close, form, submit, settle, text } = await setup();

    form.patchValue({ name: 'Ola', phone: '600100200' });
    await submit();
    http.expectOne({ url: URL, method: 'POST' }).flush(
      {
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: PHONE_INVALID,
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle();

    expect(text()).toContain(PHONE_INVALID);
    expect(close).not.toHaveBeenCalled();
  });
});

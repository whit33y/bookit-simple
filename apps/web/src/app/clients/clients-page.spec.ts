import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { CLIENT_SEARCH_LIMIT, ClientView, MeResponse } from '@bookit/shared';
import { of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { OWNER } from '../auth/me.fixtures';
import { ClientDialog } from './client-dialog';
import { ClientsPage } from './clients-page';
import { CLIENT_SEARCH_DEBOUNCE_MS } from './clients.service';
import { DeleteClientDialog } from './delete-client-dialog';

const URL = '/api/clients';

const client = (fields: Partial<ClientView>): ClientView => ({
  id: 'c',
  name: 'Klient',
  phoneE164: null,
  notes: null,
  ...fields,
});

const ANNA = client({
  id: 'c1',
  name: 'Anna Nowak',
  phoneE164: '+48600100200',
  notes: 'Woli rano',
});
const LUCJA = client({ id: 'c2', name: 'Łucja' });

const EMPLOYEE: MeResponse = { ...OWNER, role: 'EMPLOYEE' };

describe('ClientsPage', () => {
  async function setup({
    list = [ANNA, LUCJA],
    me = OWNER,
    closeWith,
  }: { list?: ClientView[]; me?: MeResponse; closeWith?: unknown } = {}) {
    const open = vi.fn(() => ({ afterClosed: () => of(closeWith) }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open } },
        { provide: AuthService, useValue: { me: signal(me) } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ClientsPage);
    fixture.detectChanges();
    http.expectOne(URL).flush(list);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async (ms = 0) => {
      await new Promise((r) => setTimeout(r, ms));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const names = () =>
      [...el.querySelectorAll('li .name')].map((n) => n.textContent?.trim());
    const row = (name: string) =>
      el.querySelector(`li[aria-label="${name}"]`)?.textContent ?? '';
    const button = (label: string) =>
      el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    const type = async (q: string) => {
      const input = el.querySelector<HTMLInputElement>('input[type="search"]');
      if (!input) throw new Error('No search field');
      input.value = q;
      input.dispatchEvent(new Event('input'));
      await settle(CLIENT_SEARCH_DEBOUNCE_MS + 20);
    };
    const text = () => el.textContent ?? '';
    return { http, el, open, settle, names, row, button, type, text };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('lists the Klienci with the phone in groups and the notes', async () => {
    const { names, row, el } = await setup();

    expect(
      el
        .querySelector('li[aria-label="Anna Nowak"] a.name')
        ?.getAttribute('href'),
    ).toBe('/panel/klienci/c1');
    expect(names()).toEqual(['Anna Nowak', 'Łucja']);
    expect(row('Anna Nowak')).toContain('+48 600 100 200');
    expect(row('Anna Nowak')).toContain('Woli rano');
  });

  it('searches once typing stops', async () => {
    const { http, type, settle, names } = await setup();

    await type(' lucja ');
    http.expectOne(`${URL}?q=lucja`).flush([LUCJA]);
    await settle();

    expect(names()).toEqual(['Łucja']);
  });

  it('says when nobody matches the search', async () => {
    const { http, type, settle, text } = await setup();

    await type('zenon');
    http.expectOne(`${URL}?q=zenon`).flush([]);
    await settle();

    expect(text()).toContain('Nikt nie pasuje do „zenon”.');
  });

  it(`says only the first ${CLIENT_SEARCH_LIMIT} are shown when there may be more`, async () => {
    const many = Array.from({ length: CLIENT_SEARCH_LIMIT }, (_, i) =>
      client({ id: `c${i}`, name: `Klient ${i}` }),
    );
    const { text } = await setup({ list: many });

    expect(text()).toContain(`Widać pierwszych ${CLIENT_SEARCH_LIMIT}`);
  });

  it('adds a Klient from the dialog to the top of the list', async () => {
    const saved = client({ id: 'c3', name: 'Zofia' });
    const { el, open, settle, names } = await setup({ closeWith: saved });

    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Dodaj Klienta'))
      ?.click();
    await settle();

    expect(open).toHaveBeenCalledWith(ClientDialog, expect.anything());
    expect(names()).toEqual(['Zofia', 'Anna Nowak', 'Łucja']);
  });

  it('puts the edited Klient in place of the old one', async () => {
    const { open, button, settle, names } = await setup({
      closeWith: { ...LUCJA, name: 'Łucja K.' },
    });

    button('Edytuj: Łucja')?.click();
    await settle();

    expect(open).toHaveBeenCalledWith(
      ClientDialog,
      expect.objectContaining({ data: { client: LUCJA } }),
    );
    expect(names()).toEqual(['Anna Nowak', 'Łucja K.']);
  });

  it('lets the Właściciel delete a Klient after a question', async () => {
    const { http, open, button, settle, names } = await setup({
      closeWith: true,
    });

    button('Usuń: Anna Nowak')?.click();
    await settle();
    expect(open).toHaveBeenCalledWith(
      DeleteClientDialog,
      expect.objectContaining({ data: { name: 'Anna Nowak' } }),
    );
    http.expectOne({ url: `${URL}/c1`, method: 'DELETE' }).flush(null);
    await settle();

    expect(names()).toEqual(['Łucja']);
  });

  it('does not offer deleting to a Pracownik', async () => {
    const { button } = await setup({ me: EMPLOYEE });

    expect(button('Edytuj: Anna Nowak')).not.toBeNull();
    expect(button('Usuń: Anna Nowak')).toBeNull();
  });
});

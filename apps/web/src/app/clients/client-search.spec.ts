import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ClientView } from '@bookit/shared';
import { of } from 'rxjs';
import { ClientDialog } from './client-dialog';
import { ClientSearch } from './client-search';
import { CLIENT_SEARCH_DEBOUNCE_MS } from './clients.service';

const URL = '/api/clients';

const ANNA: ClientView = {
  id: 'c1',
  name: 'Anna Nowak',
  phoneE164: '+48600100200',
  notes: null,
};
const OLA: ClientView = { id: 'c2', name: 'Ola', phoneE164: null, notes: null };

@Component({
  imports: [ClientSearch],
  template: `<app-client-search [(client)]="client" />`,
})
class Host {
  readonly client = signal<ClientView | null>(null);
}

describe('ClientSearch', () => {
  async function setup(closeWith?: unknown, initial: ClientView | null = null) {
    const open = vi.fn(() => ({ afterClosed: () => of(closeWith) }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.client.set(initial);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    const settle = async (ms = 0) => {
      await new Promise((r) => setTimeout(r, ms));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const type = async (q: string) => {
      input.focus();
      input.value = q;
      input.dispatchEvent(new Event('input'));
      await settle(CLIENT_SEARCH_DEBOUNCE_MS + 20);
    };
    // The options are in the overlay, outside the component.
    const options = () => [
      ...document.querySelectorAll<HTMLElement>('mat-option'),
    ];
    const option = (text: string) => {
      const found = options().find((o) => o.textContent?.includes(text));
      if (!found) throw new Error(`No option "${text}"`);
      return found;
    };
    return { http, open, fixture, input, settle, type, options, option };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('shows the Klienci found and picks one', async () => {
    const { http, fixture, input, type, settle, option } = await setup();
    http.expectOne(URL).flush([ANNA, OLA]);

    await type('anna');
    http.expectOne(`${URL}?q=anna`).flush([ANNA]);
    await settle();
    expect(option('Anna Nowak').textContent).toContain('+48 600 100 200');
    option('Anna Nowak').click();
    await settle();

    expect(fixture.componentInstance.client()).toEqual(ANNA);
    expect(input.value).toBe('Anna Nowak');
  });

  it('forgets the picked Klient once the text changes', async () => {
    const { http, fixture, type } = await setup(undefined, ANNA);
    http.expectOne(URL).flush([]);

    await type('Ann');
    http.expectOne(`${URL}?q=Ann`).flush([ANNA]);

    expect(fixture.componentInstance.client()).toBeNull();
  });

  it('adds a new Klient with the typed name and picks them', async () => {
    const zofia: ClientView = { ...OLA, id: 'c3', name: 'Zofia' };
    const { http, open, fixture, type, settle, option } = await setup(zofia);
    http.expectOne(URL).flush([]);

    await type('Zofia');
    http.expectOne(`${URL}?q=Zofia`).flush([]);
    await settle();
    option('Dodaj nowego Klienta').click();
    await settle();

    expect(open).toHaveBeenCalledWith(
      ClientDialog,
      expect.objectContaining({
        data: { name: 'Zofia', canPickExisting: true },
      }),
    );
    expect(fixture.componentInstance.client()).toEqual(zofia);
  });

  it('starts a new Klient from a typed phone number', async () => {
    const { http, open, type, settle, option } = await setup();
    http.expectOne(URL).flush([]);

    await type('600 100');
    http.expectOne(`${URL}?q=600%20100`).flush([]);
    await settle();
    option('Dodaj nowego Klienta').click();
    await settle();

    expect(open).toHaveBeenCalledWith(
      ClientDialog,
      expect.objectContaining({
        data: { phone: '600 100', canPickExisting: true },
      }),
    );
  });
});

import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminSalonSummary } from '@bookit/shared';
import { SalonsPage, searchKey } from './salons-page';

const salon = (
  name: string,
  overrides: Partial<AdminSalonSummary> = {},
): AdminSalonSummary => ({
  id: crypto.randomUUID(),
  name,
  slug: name.toLowerCase().replace(/\W+/g, '-'),
  status: 'ACTIVE',
  createdAt: '2026-09-29T10:00:00.000Z',
  owner: {
    displayName: 'Anna',
    email: `${name.length}@bookit.test`,
    invitationAccepted: true,
  },
  ...overrides,
});

const SALONS = [
  salon('Łódź Nails & Spa'),
  salon('Studio Kora', { status: 'SUSPENDED' }),
  salon('Barber Wola', {
    owner: {
      displayName: 'Piotr',
      email: 'piotr@barber.pl',
      invitationAccepted: false,
    },
  }),
];

describe('searchKey', () => {
  it('ignores case, Polish letters and extra spaces', () => {
    expect(searchKey('  ŁÓDŹ   Nails ')).toBe('lodz nails');
  });
});

describe('SalonsPage', () => {
  async function setup(salons: AdminSalonSummary[] = SALONS) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SalonsPage);
    fixture.detectChanges();
    http.expectOne('/api/admin/salons').flush(salons);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const names = () =>
      [...el.querySelectorAll('.row a.name')].map((n) => n.textContent?.trim());
    const search = async (value: string) => {
      const input = el.querySelector<HTMLInputElement>('input[type=search]')!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const toggle = async (label: string) => {
      const button = [...el.querySelectorAll('mat-button-toggle button')].find(
        (b) => b.textContent?.includes(label),
      ) as HTMLButtonElement;
      button.click();
      await settle();
    };
    return { el, names, search, toggle };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('lists the Salons with a link to each', async () => {
    const { el, names } = await setup();

    expect(names()).toEqual(['Łódź Nails & Spa', 'Studio Kora', 'Barber Wola']);
    expect(el.querySelector('a.name')?.getAttribute('href')).toBe(
      `/admin/salony/${SALONS[0].id}`,
    );
    expect(el.textContent).toContain('Zawieszony');
    expect(el.textContent).toContain('Oczekuje');
  });

  it('searches by name without Polish letters', async () => {
    const { el, names, search } = await setup();

    await search('lodz');
    expect(names()).toEqual(['Łódź Nails & Spa']);

    await search('nie ma takiego');
    expect(names()).toEqual([]);
    expect(el.textContent).toContain('Żaden Salon nie pasuje');
  });

  it('filters by status and by a pending invitation, with counts', async () => {
    const { el, names, toggle } = await setup();

    expect(el.textContent).toContain('Zawieszone 1');
    await toggle('Zawieszone');
    expect(names()).toEqual(['Studio Kora']);
    await toggle('Zaproszenie oczekuje');
    expect(names()).toEqual(['Barber Wola']);
  });

  it('says when there is no Salon yet', async () => {
    const { el } = await setup([]);

    expect(el.textContent).toContain('Nie ma jeszcze żadnego Salonu.');
  });
});

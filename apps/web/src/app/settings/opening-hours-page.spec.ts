import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  OPENING_HOURS_CLOSES_BEFORE_OPENS,
  OpeningHoursDay,
} from '@bookit/shared';
import { OpeningHoursPage } from './opening-hours-page';

const URL = '/api/opening-hours';
const WEEK: OpeningHoursDay[] = [
  { weekday: 1, opensAt: '09:00', closesAt: '19:00' },
  { weekday: 6, opensAt: '10:00', closesAt: '14:00' },
];

describe('OpeningHoursPage', () => {
  async function setup(days: OpeningHoursDay[] = WEEK) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(OpeningHoursPage);
    fixture.detectChanges();
    http.expectOne(URL).flush(days);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const input = (label: string) =>
      el.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    const type = (label: string, value: string) => {
      const found = input(label);
      if (!found) throw new Error(`No field "${label}"`);
      found.value = value;
      found.dispatchEvent(new Event('input'));
    };
    const toggle = async (day: string) => {
      const found = el.querySelector<HTMLButtonElement>(
        `button[aria-label="${day}: otwarte"]`,
      );
      if (!found) throw new Error(`No switch "${day}"`);
      found.click();
      await settle();
    };
    const row = (day: string) =>
      el.querySelector(`li[aria-label="${day}"]`)?.textContent ?? '';
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
    return { http, el, settle, input, type, toggle, row, button, submit, text };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('shows seven days, the ones without hours closed', async () => {
    const { el, input, row } = await setup();

    expect(el.querySelectorAll('li.row')).toHaveLength(7);
    expect(input('Poniedziałek: od')?.value).toBe('09:00');
    expect(input('Poniedziałek: do')?.value).toBe('19:00');
    expect(input('Sobota: od')?.value).toBe('10:00');
    expect(row('Wtorek')).toContain('Zamknięte');
    expect(input('Wtorek: od')).toBeNull();
    expect(row('Niedziela')).toContain('Zamknięte');
  });

  it('saves only the open days', async () => {
    const { http, type, toggle, submit, settle, text } = await setup();

    await toggle('Środa');
    type('Środa: od', '08:15');
    type('Środa: do', '16:45');
    await toggle('Sobota');
    await submit();

    const req = http.expectOne({ url: URL, method: 'PUT' });
    expect(req.request.body).toEqual([
      { weekday: 1, opensAt: '09:00', closesAt: '19:00' },
      { weekday: 3, opensAt: '08:15', closesAt: '16:45' },
    ]);
    req.flush(req.request.body);
    await settle();
    expect(text()).toContain('Zapisano Godziny otwarcia');
  });

  it('opens a closed day with default hours', async () => {
    const { toggle, input } = await setup();

    await toggle('Niedziela');

    expect(input('Niedziela: od')?.value).toBe('09:00');
    expect(input('Niedziela: do')?.value).toBe('17:00');
  });

  it('copies Monday to Tuesday–Friday and leaves the weekend', async () => {
    const { http, button, settle, submit } = await setup([
      { weekday: 1, opensAt: '09:00', closesAt: '19:00' },
      { weekday: 3, opensAt: '12:00', closesAt: '13:00' },
      { weekday: 7, opensAt: '10:00', closesAt: '14:00' },
    ]);

    button('Skopiuj na dni robocze').click();
    await settle();
    await submit();

    const req = http.expectOne({ url: URL, method: 'PUT' });
    expect(req.request.body).toEqual([
      ...[1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        opensAt: '09:00',
        closesAt: '19:00',
      })),
      { weekday: 7, opensAt: '10:00', closesAt: '14:00' },
    ]);
    req.flush(req.request.body);
    await settle();
  });

  it('copies a closed Monday as closed', async () => {
    const { button, settle, row } = await setup([
      { weekday: 2, opensAt: '09:00', closesAt: '19:00' },
    ]);

    button('Skopiuj na dni robocze').click();
    await settle();

    expect(row('Wtorek')).toContain('Zamknięte');
  });

  it.each([
    ['before', '08:00'],
    ['at the same time as', '09:00'],
  ])('does not save a day that closes %s it opens', async (_, closesAt) => {
    const { type, submit, settle, row } = await setup();

    type('Poniedziałek: do', closesAt);
    await submit();
    await settle();

    expect(row('Poniedziałek')).toContain(OPENING_HOURS_CLOSES_BEFORE_OPENS);
  });

  it('shows the message of a refused save', async () => {
    const { http, submit, settle, text } = await setup();

    await submit();
    http
      .expectOne({ url: URL, method: 'PUT' })
      .flush(
        {
          message: OPENING_HOURS_CLOSES_BEFORE_OPENS,
          error: 'Unprocessable Entity',
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await settle();

    expect(text()).toContain(OPENING_HOURS_CLOSES_BEFORE_OPENS);
  });
});

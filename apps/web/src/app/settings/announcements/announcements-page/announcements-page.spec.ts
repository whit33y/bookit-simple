import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { AnnouncementView } from '@bookit/shared';
import { of } from 'rxjs';
import { AnnouncementDialog } from '../announcement-dialog/announcement-dialog';
import { AnnouncementsPage } from './announcements-page';
import { DeleteAnnouncementDialog } from '../delete-announcement-dialog/delete-announcement-dialog';

const URL = '/api/announcements';

const announcement = (fields: Partial<AnnouncementView>): AnnouncementView => ({
  id: 'a',
  title: 'Ogłoszenie',
  body: 'Treść',
  photoId: null,
  showFrom: '2026-09-01',
  showUntil: null,
  ...fields,
});

// Newest showFrom first, as the api sends them.
const PLANNED_LATER = announcement({
  id: 'a1',
  title: 'Nowy rok',
  showFrom: '2027-01-01',
});
const PLANNED_TOMORROW = announcement({
  id: 'a2',
  title: 'Od jutra',
  showFrom: '2026-10-01',
  showUntil: '2026-10-31',
});
const LAST_DAY = announcement({
  id: 'a3',
  title: 'Ostatni dzień promocji',
  photoId: 'p1',
  showFrom: '2026-09-15',
  showUntil: '2026-09-30',
});
const NO_END = announcement({
  id: 'a4',
  title: 'Nowy fotel',
  showFrom: '2026-09-01',
});
const ENDED_LONG_AGO = announcement({
  id: 'a5',
  title: 'Wakacje',
  showFrom: '2026-07-01',
  showUntil: '2026-08-31',
});
const ENDED_YESTERDAY = announcement({
  id: 'a6',
  title: 'Wczoraj',
  showFrom: '2026-08-01',
  showUntil: '2026-09-29',
});
const ALL = [
  PLANNED_LATER,
  PLANNED_TOMORROW,
  LAST_DAY,
  NO_END,
  ENDED_YESTERDAY,
  ENDED_LONG_AGO,
];

describe('AnnouncementsPage', () => {
  async function setup(
    list: AnnouncementView[] = ALL,
    closeWith?: unknown,
    now = '2026-09-30T21:30:00Z',
  ) {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(now) });
    const open = vi.fn(() => ({ afterClosed: () => of(closeWith) }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AnnouncementsPage);
    fixture.detectChanges();
    http.expectOne(URL).flush(list);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const titles = (group: string) =>
      [...el.querySelectorAll(`ul[aria-label="${group}"] li .title`)].map((t) =>
        t.textContent?.trim(),
      );
    const row = (title: string) =>
      el.querySelector(`li[aria-label="${title}"]`)?.textContent ?? '';
    const button = (label: string) => {
      const found = el.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      );
      if (!found) throw new Error(`No button "${label}"`);
      return found;
    };
    const text = () => el.textContent ?? '';
    return { http, el, open, settle, titles, row, button, text };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.useRealTimers();
  });

  it('sorts the Ogłoszenia into active, planned and past by the day in Warsaw', async () => {
    // 23:30 on 30 September in Warsaw, while UTC is at 21:30.
    const { titles } = await setup();

    expect(titles('Aktywne')).toEqual(['Ostatni dzień promocji', 'Nowy fotel']);
    expect(titles('Zaplanowane')).toEqual(['Od jutra', 'Nowy rok']);
    expect(titles('Minione')).toEqual(['Wczoraj', 'Wakacje']);
  });

  it('moves the one ending today to the past after midnight in Warsaw', async () => {
    // 00:30 on 1 October in Warsaw, still 30 September in UTC.
    const { titles } = await setup(ALL, undefined, '2026-09-30T22:30:00Z');

    expect(titles('Aktywne')).toEqual(['Od jutra', 'Nowy fotel']);
    expect(titles('Zaplanowane')).toEqual(['Nowy rok']);
    expect(titles('Minione')).toEqual([
      'Ostatni dzień promocji',
      'Wczoraj',
      'Wakacje',
    ]);
  });

  it('shows the days, the photo and the text of each', async () => {
    const { el, row } = await setup();

    expect(row('Nowy fotel')).toContain('od 1.09.2026, bez końca');
    expect(row('Od jutra')).toContain('1.10.2026 – 31.10.2026');
    expect(row('Nowy fotel')).toContain('Treść');
    expect(
      el
        .querySelector('li[aria-label="Ostatni dzień promocji"] img')
        ?.getAttribute('src'),
    ).toBe('/api/public/photos/p1');
  });

  it('says when a group is empty', async () => {
    const { text } = await setup([NO_END]);

    expect(text()).toContain('Brak zaplanowanych Ogłoszeń.');
    expect(text()).toContain('Brak minionych Ogłoszeń.');
  });

  it('adds the Ogłoszenie saved in the dialog to its group', async () => {
    const saved = announcement({
      id: 'new',
      title: 'Nowe',
      showFrom: '2026-12-01',
    });
    const { el, open, settle, titles } = await setup([NO_END], saved);

    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Dodaj Ogłoszenie'))
      ?.click();
    await settle();

    expect(open).toHaveBeenCalledWith(AnnouncementDialog, {
      data: {},
      autoFocus: 'dialog',
    });
    expect(titles('Zaplanowane')).toEqual(['Nowe']);
  });

  it('puts an edited Ogłoszenie where its new days belong', async () => {
    const moved = { ...NO_END, showUntil: '2026-09-29' };
    const { open, button, settle, titles } = await setup([NO_END], moved);

    button('Edytuj: Nowy fotel').click();
    await settle();

    expect(open).toHaveBeenCalledWith(AnnouncementDialog, {
      data: { announcement: NO_END },
      autoFocus: 'dialog',
    });
    expect(titles('Aktywne')).toEqual([]);
    expect(titles('Minione')).toEqual(['Nowy fotel']);
  });

  it('deletes after asking', async () => {
    const { http, open, button, settle, titles } = await setup(
      [NO_END, ENDED_LONG_AGO],
      true,
    );

    button('Usuń: Wakacje').click();
    await settle();
    expect(open).toHaveBeenCalledWith(DeleteAnnouncementDialog, {
      data: { title: 'Wakacje' },
    });
    http.expectOne({ url: `${URL}/a5`, method: 'DELETE' }).flush(null);
    await settle();

    expect(titles('Minione')).toEqual([]);
    expect(titles('Aktywne')).toEqual(['Nowy fotel']);
  });

  it('does not delete when the question is cancelled', async () => {
    const { button, settle, titles } = await setup([NO_END], false);

    button('Usuń: Nowy fotel').click();
    await settle();

    expect(titles('Aktywne')).toEqual(['Nowy fotel']);
  });
});

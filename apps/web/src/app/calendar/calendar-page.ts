import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import {
  addDays,
  CalendarDay,
  CalendarResponse,
  isCalendarDay,
  warsawDate,
} from '@bookit/shared';
import { errorMessage } from '../shared/error-message';
import { CalendarDayGrid } from './calendar-day-grid';
import { CalendarService } from './calendar.service';

const PATH = '/panel/kalendarz';

interface LoadedDay {
  day: CalendarDay;
  calendar: CalendarResponse;
}
/** How often the line of the current hour moves. */
const CLOCK_TICK_MS = 30 * 1000;

/**
 * `/panel/kalendarz?dzien=YYYY-MM-DD`: the day view of the calendar, today without
 * `dzien`. The form and the card of a Wizyta come in #30, the phone view in #32.
 */
@Component({
  selector: 'app-calendar-page',
  imports: [
    CalendarDayGrid,
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    RouterLink,
  ],
  template: `
    <header class="bar">
      <nav class="days" aria-label="Dni">
        <a
          mat-icon-button
          [routerLink]="path"
          [queryParams]="{ dzien: previous() }"
          aria-label="Poprzedni dzień"
        >
          <mat-icon>chevron_left</mat-icon>
        </a>
        <a mat-stroked-button [routerLink]="path">Dziś</a>
        <a
          mat-icon-button
          [routerLink]="path"
          [queryParams]="{ dzien: next() }"
          aria-label="Następny dzień"
        >
          <mat-icon>chevron_right</mat-icon>
        </a>
      </nav>
      <h1>{{ noon() | date: 'EEEE, d MMMM y' : 'UTC' }}</h1>
      @if (holiday(); as name) {
        <span class="holiday">{{ name }}</span>
      }
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Dzień</mat-label>
        <input
          matInput
          type="date"
          name="day"
          [value]="day()"
          (change)="go($any($event.target).value)"
        />
      </mat-form-field>
    </header>

    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else if (shown(); as shown) {
      <app-calendar-day-grid
        [class.loading]="calendar.isLoading()"
        [attr.aria-busy]="calendar.isLoading()"
        [day]="shown.day"
        [calendar]="shown.calendar"
        [currentTime]="now()"
      />
    } @else {
      <mat-spinner diameter="32" aria-label="Wczytywanie" />
    }
  `,
  styles: `
    .bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      align-items: center;
      margin-bottom: 16px;
    }
    .days {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    h1 {
      margin: 0;
      font-size: 22px;
    }
    h1::first-letter {
      text-transform: uppercase;
    }
    .holiday {
      padding: 4px 12px;
      border-radius: 8px;
      font-size: 14px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
    mat-form-field {
      margin-left: auto;
    }
    .loading {
      opacity: 0.5;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class CalendarPage {
  private readonly api = inject(CalendarService);
  private readonly router = inject(Router);

  /** `?dzien=` */
  readonly dzien = input<string>();

  protected readonly path = PATH;
  protected readonly now = signal(new Date());

  /** `?dzien=`, or today when it is missing or not a real day. */
  protected readonly day = computed<CalendarDay>(() => {
    const day = this.dzien();
    return day && isCalendarDay(day) ? day : warsawDate(this.now());
  });
  protected readonly previous = computed(() => addDays(this.day(), -1));
  protected readonly next = computed(() => addDays(this.day(), 1));
  /** Noon UTC of the day, to print its date in any time zone. */
  protected readonly noon = computed(() => new Date(`${this.day()}T12:00:00Z`));

  protected readonly calendar = resource({
    params: () => this.day(),
    loader: async ({ params: day }): Promise<LoadedDay> => ({
      day,
      calendar: await this.api.get(day, day),
    }),
  });

  /** The last day loaded: it stays while the next one loads, so the grid does not jump. */
  protected readonly shown = linkedSignal<
    LoadedDay | undefined,
    LoadedDay | undefined
  >({
    source: () =>
      this.calendar.hasValue() ? this.calendar.value() : undefined,
    computation: (loaded, previous) => loaded ?? previous?.value,
  });

  protected readonly error = computed(() => {
    const error = this.calendar.error();
    return error ? errorMessage(error) : null;
  });

  protected readonly holiday = computed(() => {
    const shown = this.shown();
    if (shown?.day !== this.day()) return null;
    return (
      shown.calendar.holidays.find((h) => h.date === shown.day)?.name ?? null
    );
  });

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected go(day: string): void {
    if (isCalendarDay(day)) {
      void this.router.navigate([PATH], { queryParams: { dzien: day } });
    }
  }
}

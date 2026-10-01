import { BreakpointObserver } from '@angular/cdk/layout';
import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import {
  addDays,
  CalendarDay,
  CalendarResponse,
  CalendarVisit,
  ClientView,
  isCalendarDay,
  VisitCollision,
  warsawDate,
} from '@bookit/shared';
import { firstValueFrom, map } from 'rxjs';
import { NEW_VISIT_CLIENT_PARAM } from '../clients/client-links';
import { ClientsService } from '../clients/clients.service';
import { errorMessage } from '../shared/error-message';
import { CalendarDayGrid, CalendarSlot } from './calendar-day-grid';
import { CalendarService } from './calendar.service';
import { MoveCollisionsDialog } from './move-collisions-dialog';
import { openVisitCard } from './visit-card';
import { openVisitDialog, PHONE_QUERY, VisitDialogData } from './visit-dialog';
import { moveRequest, replaceVisit, VisitMove } from './visit-drag';
import { collisionsOf } from './visit-request';
import { VisitsService } from './visits.service';

const PATH = '/panel/kalendarz';

interface LoadedDay {
  day: CalendarDay;
  calendar: CalendarResponse;
}
/** How often the line of the current hour moves. */
const CLOCK_TICK_MS = 30 * 1000;

/**
 * `/panel/kalendarz?dzien=YYYY-MM-DD`: the day view of the calendar, today without
 * `dzien`. A click in an empty field opens the Wizyta form there, a click in a Wizyta
 * its card; `?klient=<id>` (from the karta Klienta) opens the form with that Klient.
 * From 768 px a Wizyta is dragged: the calendar shows it at once and puts it back when
 * the save fails. The phone view comes in #32.
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
      <button
        mat-flat-button
        type="button"
        [disabled]="!shown()"
        (click)="newVisit({ day: day() })"
      >
        <mat-icon>add</mat-icon>
        Nowa Wizyta
      </button>
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
        [editable]="!phone()"
        (slotClick)="pickSlot($event)"
        (visitClick)="openCard($event)"
        (visitMove)="move($event)"
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
  private readonly dialog = inject(MatDialog);
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly clients = inject(ClientsService);
  private readonly visits = inject(VisitsService);
  private readonly snackBar = inject(MatSnackBar);

  /** `?dzien=` */
  readonly dzien = input<string>();
  /** `?klient=`: open the form with this Klient. */
  readonly klient = input<string>();

  protected readonly path = PATH;
  /** The `?klient=` the form was opened for, so a reload does not open it again. */
  private openedFor: string | undefined;
  protected readonly now = signal(new Date());
  /** Below 768 px a Wizyta is moved in the form, not dragged. */
  protected readonly phone = toSignal(
    this.breakpoints.observe(PHONE_QUERY).pipe(map((state) => state.matches)),
    { initialValue: this.breakpoints.isMatched(PHONE_QUERY) },
  );

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

    // The form needs the people of the calendar, so it waits for the first day.
    effect(() => {
      const id = this.klient();
      if (id && id !== this.openedFor && this.shown()) {
        this.openedFor = id;
        untracked(() => this.newVisitFor(id));
      }
    });
  }

  protected pickSlot(slot: CalendarSlot): void {
    void this.newVisit({
      staffMemberId: slot.staffMemberId,
      startsAt: slot.startsAt,
    });
  }

  protected async newVisit(
    data: Omit<VisitDialogData, 'staff'>,
  ): Promise<void> {
    const staff = this.shown()?.calendar.staff;
    if (!staff) return;
    const saved = await openVisitDialog(this.dialog, this.breakpoints, {
      staff,
      ...data,
    });
    if (saved) this.calendar.reload();
  }

  protected async openCard(visit: CalendarVisit): Promise<void> {
    const staff = this.shown()?.calendar.staff ?? [];
    const result = await openVisitCard(this.dialog, { visit, staff });
    // The card saves changes of the Stan Wizyty itself.
    if (!result) {
      this.calendar.reload();
      return;
    }
    const saved = await openVisitDialog(this.dialog, this.breakpoints, {
      staff,
      visit: result.edit,
    });
    if (saved) this.calendar.reload();
  }

  /**
   * Shows the dragged Wizyta at its new place and saves it. A Kolizja asks first, and
   * "Cofnij" or a failed save puts it back where it was.
   */
  protected async move({ before, after }: VisitMove): Promise<void> {
    this.showVisit(after);
    try {
      if (await this.saveMove(before, after)) {
        this.calendar.reload();
        return;
      }
    } catch (error) {
      this.snackBar.open(
        `Nie przeniesiono Wizyty. ${errorMessage(error)}`,
        'OK',
        { duration: 6000 },
      );
    }
    this.showVisit(before);
  }

  /** Resolves with `false` for "Cofnij" on the Kolizje. */
  private async saveMove(
    before: CalendarVisit,
    after: CalendarVisit,
  ): Promise<boolean> {
    try {
      await this.visits.update(before.id, moveRequest(before, after));
    } catch (error) {
      const collisions = collisionsOf(error);
      if (!collisions) throw error;
      if (!(await this.confirmCollisions(collisions))) return false;
      await this.visits.update(before.id, moveRequest(before, after, true));
    }
    return true;
  }

  private showVisit(visit: CalendarVisit): void {
    this.shown.update(
      (shown) =>
        shown && { ...shown, calendar: replaceVisit(shown.calendar, visit) },
    );
  }

  private confirmCollisions(collisions: VisitCollision[]): Promise<boolean> {
    return firstValueFrom(
      this.dialog
        .open<MoveCollisionsDialog, VisitCollision[], boolean>(
          MoveCollisionsDialog,
          { data: collisions, width: '480px' },
        )
        .afterClosed()
        .pipe(map(Boolean)),
    );
  }

  /** Takes `?klient=` off the address first, so going back does not open the form again. */
  private async newVisitFor(clientId: string): Promise<void> {
    void this.router.navigate([], {
      queryParams: { [NEW_VISIT_CLIENT_PARAM]: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    let client: ClientView | undefined;
    try {
      client = await this.clients.get(clientId);
    } catch {
      // A Klient removed meanwhile: the form opens without one.
    }
    await this.newVisit({ day: this.day(), client });
  }

  protected go(day: string): void {
    if (isCalendarDay(day)) {
      void this.router.navigate([PATH], { queryParams: { dzien: day } });
    }
  }
}

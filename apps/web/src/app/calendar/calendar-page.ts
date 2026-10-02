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
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import {
  AbsenceView,
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
import { AbsenceDialogData, openAbsenceDialog } from './absence-dialog';
import {
  GridColumn,
  nextQuarter,
  personColumns,
  pickPerson,
  storedPerson,
  storePerson,
  swipeStep,
  weekColumns,
  weekStart,
  weekTitle,
} from './calendar-columns';
import { CalendarDayGrid, CalendarSlot } from './calendar-day-grid';
import { CalendarService } from './calendar.service';
import { dayColumns } from './day-layout';
import { MoveCollisionsDialog } from './move-collisions-dialog';
import { openVisitCard } from './visit-card';
import { openVisitDialog, PHONE_QUERY, VisitDialogData } from './visit-dialog';
import { moveRequest, replaceVisit, VisitMove } from './visit-drag';
import { collisionsOf } from './visit-request';
import { VisitsService } from './visits.service';

const PATH = '/panel/kalendarz';
const WEEK_PATH = '/panel/kalendarz/tydzien';

export type CalendarView = 'day' | 'week';

/** What the calendar loaded: a day, or the week from `from`. */
interface Loaded {
  week: boolean;
  from: CalendarDay;
  calendar: CalendarResponse;
}
/** How often the line of the current hour moves. */
const CLOCK_TICK_MS = 30 * 1000;

/**
 * `/panel/kalendarz?dzien=YYYY-MM-DD`: the day view of the calendar, today without
 * `dzien`. `/panel/kalendarz/tydzien?osoba=<id>&od=YYYY-MM-DD`: the week view, the
 * seven days of one person from the Monday of `od`. A click in an empty field opens
 * the Wizyta form there, a click in a Wizyta its card, a click in a Nieobecność its
 * form; `?klient=<id>` (from the karta Klienta) opens the form with that Klient. From
 * 768 px a Wizyta is dragged: the calendar shows it at once and puts it back when the
 * save fails. Below 768 px the day view has one person, changed by a swipe, and a "+"
 * for a new Wizyta. The person last picked is remembered in the browser.
 */
@Component({
  selector: 'app-calendar-page',
  imports: [
    CalendarDayGrid,
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    RouterLink,
  ],
  template: `
    <header class="bar">
      @if (!phone()) {
        <mat-button-toggle-group
          aria-label="Widok"
          hideSingleSelectionIndicator
          [value]="week() ? 'week' : 'day'"
          (change)="switchView($event.value)"
        >
          <mat-button-toggle value="day">Dzień</mat-button-toggle>
          <mat-button-toggle value="week">Tydzień</mat-button-toggle>
        </mat-button-toggle-group>
      }
      @if (week()) {
        <nav class="days" aria-label="Tygodnie">
          <a
            mat-icon-button
            [routerLink]="weekPath"
            [queryParams]="{ osoba: person()?.id, od: previous() }"
            aria-label="Poprzedni tydzień"
          >
            <mat-icon>chevron_left</mat-icon>
          </a>
          <a
            mat-stroked-button
            [routerLink]="weekPath"
            [queryParams]="{ osoba: person()?.id }"
            >Ten tydzień</a
          >
          <a
            mat-icon-button
            [routerLink]="weekPath"
            [queryParams]="{ osoba: person()?.id, od: next() }"
            aria-label="Następny tydzień"
          >
            <mat-icon>chevron_right</mat-icon>
          </a>
        </nav>
        <h1>{{ weekHeading() }}</h1>
      } @else {
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
      }
      <span class="fields">
        @if ((week() || phone()) && people().length) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Osoba</mat-label>
            <mat-select
              [value]="person()?.id"
              (selectionChange)="choose($event.value)"
            >
              @for (option of people(); track option.id) {
                <mat-option [value]="option.id">{{
                  option.displayName
                }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Dzień</mat-label>
          <input
            matInput
            type="date"
            name="day"
            [value]="focusDay()"
            (change)="go($any($event.target).value)"
          />
        </mat-form-field>
      </span>
      <button
        mat-stroked-button
        type="button"
        [disabled]="!shown()"
        (click)="newAbsence()"
      >
        <mat-icon>event_busy</mat-icon>
        Nowa Nieobecność
      </button>
      @if (!phone()) {
        <button
          mat-flat-button
          type="button"
          [disabled]="!shown()"
          (click)="newVisitButton()"
        >
          <mat-icon>add</mat-icon>
          Nowa Wizyta
        </button>
      }
    </header>

    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else if (shown(); as shown) {
      <div
        class="swipe"
        [class.phone]="phone()"
        (pointerdown)="swipeStart($event)"
        (pointerup)="swipeEnd($event)"
        (pointercancel)="swipeFrom = null"
      >
        <app-calendar-day-grid
          [class.loading]="calendar.isLoading()"
          [class.week]="shown.week"
          [attr.aria-busy]="calendar.isLoading()"
          [columns]="columns()"
          [calendar]="shown.calendar"
          [currentTime]="now()"
          [editable]="!phone()"
          (slotClick)="pickSlot($event)"
          (visitClick)="openCard($event)"
          (absenceClick)="openAbsence($event)"
          (visitMove)="move($event)"
        />
      </div>
    } @else {
      <mat-spinner diameter="32" aria-label="Wczytywanie" />
    }

    @if (phone() && shown()) {
      <button
        mat-fab
        class="fab"
        type="button"
        aria-label="Nowa Wizyta"
        (click)="newVisitNow()"
      >
        <mat-icon>add</mat-icon>
      </button>
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
    .fields {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-left: auto;
    }
    .fields mat-form-field {
      width: 180px;
    }
    .swipe.phone {
      /* A swipe across changes the person; the page still scrolls up and down. */
      touch-action: pan-y;
      /* Room for the "+" under the last hour. */
      padding-bottom: 72px;
    }
    app-calendar-day-grid.week {
      --column-min: 0px;
    }
    .fab {
      position: fixed;
      right: 16px;
      /* Over the bottom navigation. */
      bottom: calc(80px + env(safe-area-inset-bottom));
      z-index: 10;
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

  /** From the route data: the week view, the day view without it. */
  readonly view = input<CalendarView>();
  /** `?dzien=` of the day view. */
  readonly dzien = input<string>();
  /** `?od=` of the week view: a day of the week to show. */
  readonly od = input<string>();
  /** `?osoba=` of the week view. */
  readonly osoba = input<string>();
  /** `?klient=`: open the form with this Klient. */
  readonly klient = input<string>();

  protected readonly path = PATH;
  protected readonly weekPath = WEEK_PATH;
  /** The `?klient=` the form was opened for, so a reload does not open it again. */
  private openedFor: string | undefined;
  protected readonly now = signal(new Date());
  /** Below 768 px a Wizyta is moved in the form, not dragged. */
  protected readonly phone = toSignal(
    this.breakpoints.observe(PHONE_QUERY).pipe(map((state) => state.matches)),
    { initialValue: this.breakpoints.isMatched(PHONE_QUERY) },
  );

  protected readonly week = computed(() => this.view() === 'week');
  private readonly today = computed(() => warsawDate(this.now()));
  private readonly asked = computed(() => {
    const day = this.week() ? this.od() : this.dzien();
    return day && isCalendarDay(day) ? day : this.today();
  });
  /** The first day shown: `?dzien=`, or the Monday of `?od=`; today without them. */
  private readonly from = computed(() =>
    this.week() ? weekStart(this.asked()) : this.asked(),
  );
  private readonly step = computed(() => (this.week() ? 7 : 1));
  protected readonly previous = computed(() =>
    addDays(this.from(), -this.step()),
  );
  protected readonly next = computed(() => addDays(this.from(), this.step()));
  /** The day of the day view; in the week view today, or its Monday. */
  protected readonly focusDay = computed(() => {
    const from = this.from();
    const today = this.today();
    if (!this.week()) return from;
    return today >= from && today <= addDays(from, 6) ? today : from;
  });
  /** Noon UTC of the day, to print its date in any time zone. */
  protected readonly noon = computed(
    () => new Date(`${this.from()}T12:00:00Z`),
  );
  protected readonly weekHeading = computed(() => weekTitle(this.from()));

  protected readonly calendar = resource({
    params: () => ({ week: this.week(), from: this.from() }),
    loader: async ({ params: { week, from } }): Promise<Loaded> => ({
      week,
      from,
      calendar: await this.api.get(from, week ? addDays(from, 6) : from),
    }),
  });

  /** The last range loaded: it stays while the next one loads, so the grid does not jump. */
  protected readonly shown = linkedSignal<
    Loaded | undefined,
    Loaded | undefined
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
    if (!shown || shown.week || shown.from !== this.from()) return null;
    return (
      shown.calendar.holidays.find((h) => h.date === shown.from)?.name ?? null
    );
  });

  /** The people to pick from in the week view and on a phone. */
  protected readonly people = computed(() => {
    const shown = this.shown();
    return shown ? dayColumns(shown.calendar.staff, shown.from) : [];
  });
  /** The person picked last, kept in the browser. */
  private readonly chosen = signal(storedPerson());
  /** The person of the week view and of the phone. */
  protected readonly person = computed(() =>
    pickPerson(this.people(), this.week() ? this.osoba() : null, this.chosen()),
  );

  protected readonly columns = computed<GridColumn[]>(() => {
    const shown = this.shown();
    if (!shown) return [];
    const person = this.person();
    if (shown.week) {
      return person
        ? weekColumns(person, shown.from, shown.calendar.holidays)
        : [];
    }
    return personColumns(
      this.phone() && person ? [person] : shown.calendar.staff,
      shown.from,
    );
  });

  /** Where a finger touched the grid, for a swipe. */
  protected swipeFrom: { x: number; y: number } | null = null;

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // A week opened from a link is of the person looked at now.
    effect(() => {
      const id = this.week() ? this.osoba() : undefined;
      if (id && id !== untracked(this.chosen)) {
        this.chosen.set(id);
        storePerson(id);
      }
    });

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
    const person = this.week() || this.phone() ? this.bookable() : undefined;
    await this.newVisit({
      day: this.focusDay(),
      ...(person ? { staffMemberId: person } : {}),
      client,
    });
  }

  /** "Nowa Wizyta": in the week view for its person. */
  protected newVisitButton(): void {
    const person = this.week() ? this.bookable() : undefined;
    void this.newVisit({
      day: this.focusDay(),
      ...(person ? { staffMemberId: person } : {}),
    });
  }

  /** The "+" of the phone: the person shown, at the next full quarter. */
  protected newVisitNow(): void {
    const person = this.bookable();
    void this.newVisit({
      ...(person ? { staffMemberId: person } : {}),
      startsAt: nextQuarter(this.now(), this.focusDay()),
    });
  }

  /** "Nowa Nieobecność": the day shown, in the week view and on a phone for the person shown. */
  protected newAbsence(): void {
    const person = this.week() || this.phone() ? this.bookable() : undefined;
    void this.absenceForm(person ? { staffMemberId: person } : {});
  }

  protected openAbsence(absence: AbsenceView): void {
    void this.absenceForm({ absence });
  }

  private async absenceForm(
    data: Omit<AbsenceDialogData, 'staff' | 'day'>,
  ): Promise<void> {
    const staff = this.shown()?.calendar.staff;
    if (!staff) return;
    const changed = await openAbsenceDialog(this.dialog, this.breakpoints, {
      staff,
      day: this.focusDay(),
      ...data,
    });
    if (changed) this.calendar.reload();
  }

  /** The id of the person shown, unless an Usunięta osoba z Personelu, who takes no new Wizyty. */
  private bookable(): string | undefined {
    const person = this.person();
    return person && person.visibleUntil === null ? person.id : undefined;
  }

  protected choose(id: string): void {
    this.chosen.set(id);
    storePerson(id);
    if (this.week()) {
      void this.router.navigate([WEEK_PATH], {
        queryParams: { osoba: id, od: this.from() },
      });
    }
  }

  protected switchView(view: CalendarView): void {
    if (view === 'week') {
      void this.router.navigate([WEEK_PATH], {
        queryParams: { osoba: this.person()?.id, od: weekStart(this.from()) },
      });
    } else {
      void this.router.navigate([PATH], {
        queryParams: { dzien: this.focusDay() },
      });
    }
  }

  protected swipeStart(event: PointerEvent): void {
    this.swipeFrom =
      this.phone() && event.pointerType !== 'mouse'
        ? { x: event.clientX, y: event.clientY }
        : null;
  }

  /** A swipe to the left shows the next person, to the right the one before. */
  protected swipeEnd(event: PointerEvent): void {
    const from = this.swipeFrom;
    this.swipeFrom = null;
    if (!from) return;
    const step = swipeStep(event.clientX - from.x, event.clientY - from.y);
    const people = this.people();
    const index = people.findIndex((p) => p.id === this.person()?.id);
    const next = step && index !== -1 ? people[index + step] : undefined;
    if (next) this.choose(next.id);
  }

  protected go(day: string): void {
    if (!isCalendarDay(day)) return;
    if (this.week()) {
      void this.router.navigate([WEEK_PATH], {
        queryParams: { osoba: this.person()?.id, od: weekStart(day) },
      });
    } else {
      void this.router.navigate([PATH], { queryParams: { dzien: day } });
    }
  }
}

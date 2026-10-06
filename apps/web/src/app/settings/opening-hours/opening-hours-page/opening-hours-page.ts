import { Component, inject, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  CLOCK_TIME_PATTERN,
  closesAfterOpens,
  OPENING_HOURS_CLOSES_BEFORE_OPENS,
  OPENING_HOURS_INVALID_TIME,
  OpeningHoursDay,
  WEEKDAY_NAMES,
  WORKING_WEEKDAYS,
} from '@bookit/shared';
import { errorMessage } from '../../../shared/error-message';
import { OpeningHoursService } from '../opening-hours.service';

/** Hours a closed day gets when it is switched to open. */
const DEFAULT_OPENS_AT = '09:00';
const DEFAULT_CLOSES_AT = '17:00';

type DayForm = FormGroup<{
  open: FormControl<boolean>;
  opensAt: FormControl<string>;
  closesAt: FormControl<string>;
}>;

/** An open day needs two `HH:mm` times, closing after opening; a closed one needs nothing. */
function dayValidator(control: AbstractControl): ValidationErrors | null {
  const { open, opensAt, closesAt } = (control as DayForm).getRawValue();
  if (!open) return null;
  if (!CLOCK_TIME_PATTERN.test(opensAt) || !CLOCK_TIME_PATTERN.test(closesAt)) {
    return { time: true };
  }
  return closesAfterOpens({ opensAt, closesAt }) ? null : { order: true };
}

const dayForm = (): DayForm =>
  new FormGroup(
    {
      open: new FormControl(false, { nonNullable: true }),
      opensAt: new FormControl(DEFAULT_OPENS_AT, { nonNullable: true }),
      closesAt: new FormControl(DEFAULT_CLOSES_AT, { nonNullable: true }),
    },
    { validators: dayValidator },
  );

/**
 * `/panel/ustawienia/godziny`: the Właściciel sets one range of Godziny otwarcia per
 * weekday or marks the day closed. They only show on the Wizytówka and in the calendar;
 * Wizyty can still be written outside them.
 */
@Component({
  selector: 'app-opening-hours-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    ReactiveFormsModule,
  ],
  template: `
    <h1>Godziny otwarcia</h1>
    <p class="hint">
      Klienci widzą je na Wizytówce, a kalendarz pokazuje resztę dnia na szaro.
      Wizytę można wpisać także poza nimi.
    </p>

    @if (loaded()) {
      <form
        aria-label="Godziny otwarcia"
        [formGroup]="form"
        (ngSubmit)="save()"
      >
        <ul class="list" formArrayName="days">
          @for (day of form.controls.days.controls; track $index) {
            <li
              class="row"
              [formGroupName]="$index"
              [attr.aria-label]="weekdays[$index]"
            >
              <mat-slide-toggle
                class="toggle"
                formControlName="open"
                [aria-label]="weekdays[$index] + ': otwarte'"
                >{{ weekdays[$index] }}</mat-slide-toggle
              >
              @if (day.controls.open.value) {
                <div class="times">
                  <mat-form-field
                    appearance="outline"
                    subscriptSizing="dynamic"
                  >
                    <mat-label>Od</mat-label>
                    <input
                      matInput
                      type="time"
                      formControlName="opensAt"
                      [attr.aria-label]="weekdays[$index] + ': od'"
                    />
                  </mat-form-field>
                  <span aria-hidden="true">–</span>
                  <mat-form-field
                    appearance="outline"
                    subscriptSizing="dynamic"
                  >
                    <mat-label>Do</mat-label>
                    <input
                      matInput
                      type="time"
                      formControlName="closesAt"
                      [attr.aria-label]="weekdays[$index] + ': do'"
                    />
                  </mat-form-field>
                </div>
                @if (submitted() && day.hasError('time')) {
                  <p class="row-error" role="alert">{{ invalidTime }}</p>
                } @else if (submitted() && day.hasError('order')) {
                  <p class="row-error" role="alert">{{ closesBeforeOpens }}</p>
                }
              } @else {
                <span class="closed">Zamknięte</span>
              }
            </li>
          }
        </ul>

        <div class="actions">
          <button
            mat-stroked-button
            type="button"
            (click)="copyToWorkingDays()"
            aria-describedby="copy-hint"
          >
            <mat-icon>content_copy</mat-icon>
            Skopiuj na dni robocze
          </button>
          <span id="copy-hint" class="hint"
            >Wtorek–piątek dostaną godziny z poniedziałku.</span
          >
          <button mat-flat-button type="submit" [disabled]="saving()">
            Zapisz
          </button>
        </div>
      </form>

      @if (notice(); as notice) {
        <p class="info" role="status">{{ notice }}</p>
      }
      @if (actionError(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    } @else if (loadError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else {
      <mat-spinner diameter="32" aria-label="Wczytywanie" />
    }
  `,
  styles: `
    h1 {
      margin: 0 0 8px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      margin: 0 0 16px;
    }
    .list {
      list-style: none;
      margin: 0 0 16px;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
      overflow: hidden;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      align-items: center;
      min-height: 56px;
      padding: 8px 16px;
      background: var(--mat-sys-surface);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .row:last-child {
      border-bottom: 0;
    }
    .toggle {
      flex: 0 0 180px;
    }
    .times {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .times mat-form-field {
      width: 130px;
    }
    .closed {
      color: var(--mat-sys-on-surface-variant);
    }
    .row-error {
      flex-basis: 100%;
      margin: 0;
      color: var(--mat-sys-error);
      font-size: 14px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      align-items: center;
    }
    .actions .hint {
      flex: 1;
      margin: 0;
    }
    .info {
      color: var(--mat-sys-primary);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class OpeningHoursPage implements OnInit {
  private readonly api = inject(OpeningHoursService);

  protected readonly weekdays = WEEKDAY_NAMES;
  protected readonly invalidTime = OPENING_HOURS_INVALID_TIME;
  protected readonly closesBeforeOpens = OPENING_HOURS_CLOSES_BEFORE_OPENS;
  protected readonly form = new FormGroup({
    days: new FormArray(WEEKDAY_NAMES.map(dayForm)),
  });

  protected readonly loaded = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  /** Row errors show only after the first try to save. */
  protected readonly submitted = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.fill(await this.api.get());
      this.loaded.set(true);
    } catch (error) {
      this.loadError.set(errorMessage(error));
    }
  }

  /** Tuesday to Friday take Monday's state and hours; nothing is saved yet. */
  protected copyToWorkingDays(): void {
    const [monday, ...rest] = WORKING_WEEKDAYS.map((weekday) =>
      this.day(weekday),
    );
    for (const day of rest) day.setValue(monday.getRawValue());
    this.notice.set(null);
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.submitted.set(true);
    this.notice.set(null);
    this.actionError.set(null);
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      this.fill(await this.api.save(this.week()));
      this.submitted.set(false);
      this.notice.set('Zapisano Godziny otwarcia');
    } catch (error) {
      this.actionError.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** Open rows only, as the API wants them. */
  private week(): OpeningHoursDay[] {
    return this.form.controls.days.controls.flatMap((day, index) => {
      const { open, opensAt, closesAt } = day.getRawValue();
      return open ? [{ weekday: index + 1, opensAt, closesAt }] : [];
    });
  }

  /** A weekday missing from `days` is closed and keeps the default hours for later. */
  private fill(days: OpeningHoursDay[]): void {
    const byWeekday = new Map(days.map((day) => [day.weekday, day]));
    this.form.controls.days.controls.forEach((day, index) => {
      const saved = byWeekday.get(index + 1);
      day.setValue({
        open: saved !== undefined,
        opensAt: saved?.opensAt ?? DEFAULT_OPENS_AT,
        closesAt: saved?.closesAt ?? DEFAULT_CLOSES_AT,
      });
    });
  }

  private day(weekday: number): DayForm {
    return this.form.controls.days.at(weekday - 1);
  }
}

import { Component, computed, input, output } from '@angular/core';
import {
  ABSENCE_DEFAULT_LABEL,
  CalendarDay,
  CalendarResponse,
  CalendarVisit,
} from '@bookit/shared';
import {
  closedBlocks,
  dayColumns,
  dayRange,
  layoutDay,
  MINUTE_MS,
  nowRow,
  SLOT_MIN,
  slots,
  slotStartsAt,
  warsawClock,
} from './day-layout';

/** An empty field of the grid that was clicked: the form of #30 starts from it. */
export interface CalendarSlot {
  staffMemberId: string;
  startsAt: Date;
}

/** CSS `grid-row` of `rows` rows from line `row`. */
const gridRow = (row: number, rows: number): string => `${row} / span ${rows}`;

/**
 * The day view from 768 px: a column for every person who Przyjmuje Wizyty, rows every
 * minute with a line every 15. Wizyty of one person that overlap go side by side.
 */
@Component({
  selector: 'app-calendar-day-grid',
  template: `
    <div class="head" [style.--columns]="columns().length">
      <span></span>
      @for (person of columns(); track person.id) {
        <span class="name">{{ person.label }}</span>
      }
    </div>
    <div
      class="body"
      [style.--columns]="columns().length"
      [style.--minutes]="range().endMin - range().startMin"
    >
      @for (slot of slots(); track slot.row) {
        @if (slot.hour) {
          <span class="time" [style.grid-row]="slot.row">{{ slot.label }}</span>
        }
      }
      @for (block of closed(); track block.row) {
        <div
          class="closed"
          [style.grid-row]="gridRow(block.row, block.rows)"
        ></div>
      }
      @for (person of columns(); track person.id) {
        @for (slot of slots(); track slot.row) {
          <!-- An Usunięta osoba z Personelu takes no new Wizyty. -->
          <button
            type="button"
            class="slot"
            [class.hour]="slot.hour"
            [style.grid-column]="person.column"
            [style.grid-row]="gridRow(slot.row, slotMin)"
            [attr.aria-label]="person.displayName + ', ' + slot.label"
            [disabled]="person.deleted"
            (click)="pick(person.id, slot.row)"
          ></button>
        }
      }
      @for (item of absences(); track item.block.absence.id) {
        <div
          class="absence"
          [style.grid-column]="item.column"
          [style.grid-row]="gridRow(item.block.row, item.block.rows)"
        >
          <span>{{ item.label }}</span>
        </div>
      }
      @for (item of visits(); track item.block.visit.id) {
        <button
          type="button"
          class="visit"
          [class.no-show]="item.noShow"
          [style.grid-column]="item.column"
          [style.grid-row]="
            gridRow(item.block.row, item.block.rows + item.block.breakRows)
          "
          [attr.aria-label]="item.label"
          [style.--lane]="item.block.lane"
          [style.--lanes]="item.block.lanes"
          [style.grid-template-rows]="
            item.block.rows + 'fr ' + item.block.breakRows + 'fr'
          "
          (click)="visitClick.emit(item.block.visit)"
        >
          <span class="work">
            <span class="line"
              ><span class="when">{{ item.time }}</span>
              <strong>{{ item.block.visit.client.name }}</strong></span
            >
            <span class="details">{{ item.details }}</span>
          </span>
          <span class="break" aria-hidden="true"></span>
        </button>
      }
      @if (now(); as row) {
        <div class="now" [style.grid-row]="row" aria-hidden="true"></div>
      }
    </div>
  `,
  styles: `
    :host {
      --axis: 48px;
      --minute: 1.6px;
      display: block;
    }
    .head,
    .body {
      display: grid;
      grid-template-columns: var(--axis) repeat(
          var(--columns),
          minmax(120px, 1fr)
        );
    }
    .head {
      position: sticky;
      top: 64px;
      z-index: 5;
      background: var(--mat-sys-surface);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .name {
      padding: 8px;
      font-weight: 600;
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .body {
      /* Room for the label of the first line. */
      padding-top: 8px;
      grid-template-rows: repeat(var(--minutes), var(--minute));
    }
    .time {
      grid-column: 1;
      align-self: start;
      transform: translateY(-50%);
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    .closed {
      grid-column: 2 / -1;
      background: var(--mat-sys-surface-container-high);
    }
    .slot {
      all: unset;
      border-top: 1px dotted var(--mat-sys-outline-variant);
      border-left: 1px solid var(--mat-sys-outline-variant);
      cursor: pointer;
      z-index: 1;
    }
    .slot.hour {
      border-top-style: solid;
    }
    .slot:hover:enabled,
    .slot:focus-visible {
      background: color-mix(in srgb, var(--mat-sys-primary) 8%, transparent);
    }
    .slot:disabled {
      cursor: default;
    }
    .absence {
      z-index: 2;
      pointer-events: none;
      padding: 4px 6px;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
      background: repeating-linear-gradient(
        -45deg,
        var(--mat-sys-outline-variant) 0 2px,
        transparent 2px 8px
      );
    }
    .absence span {
      background: var(--mat-sys-surface);
    }
    .visit {
      all: unset;
      z-index: 3;
      display: grid;
      width: calc(100% / var(--lanes) - 4px);
      margin-left: calc(100% * var(--lane) / var(--lanes) + 2px);
      cursor: pointer;
      font-size: 12px;
      line-height: 16px;
      color: var(--mat-sys-on-primary-container);
    }
    .visit:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
    }
    .work {
      overflow: hidden;
      padding: 2px 6px;
      border-left: 3px solid var(--mat-sys-primary);
      border-radius: 4px 4px 0 0;
      background: var(--mat-sys-primary-container);
    }
    .line,
    .details {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .when {
      margin-right: 4px;
    }
    .break {
      background: color-mix(
        in srgb,
        var(--mat-sys-primary-container) 45%,
        transparent
      );
    }
    .no-show .work {
      border-left-color: var(--mat-sys-outline);
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface-variant);
      text-decoration: line-through;
    }
    .no-show .break {
      background: var(--mat-sys-surface-container);
    }
    .now {
      grid-column: 1 / -1;
      z-index: 4;
      border-top: 2px solid var(--mat-sys-error);
      pointer-events: none;
    }
  `,
})
export class CalendarDayGrid {
  readonly day = input.required<CalendarDay>();
  readonly calendar = input.required<CalendarResponse>();
  /** The current time, for the line of the current hour. */
  readonly currentTime = input.required<Date>();

  /** A click in an empty field: the person and the start of its quarter. */
  readonly slotClick = output<CalendarSlot>();
  /** A click in a Wizyta, to open its card. */
  readonly visitClick = output<CalendarVisit>();

  protected readonly slotMin = SLOT_MIN;
  protected readonly gridRow = gridRow;

  protected readonly range = computed(() =>
    dayRange(this.day(), this.calendar().visits, this.calendar().absences),
  );
  protected readonly slots = computed(() => slots(this.range()));
  protected readonly closed = computed(() =>
    closedBlocks(this.range(), this.calendar().openingHours),
  );
  protected readonly now = computed(() =>
    nowRow(this.range(), this.currentTime()),
  );

  protected readonly columns = computed(() =>
    dayColumns(this.calendar().staff, this.day()).map((person, index) => ({
      ...person,
      deleted: person.visibleUntil !== null,
      label: person.visibleUntil
        ? `${person.displayName} (usunięta)`
        : person.displayName,
      // The first grid column is the time axis.
      column: index + 2,
    })),
  );

  private readonly columnOf = computed(
    () => new Map(this.columns().map((person) => [person.id, person.column])),
  );

  private readonly layout = computed(() =>
    layoutDay(this.calendar().visits, this.calendar().absences, this.range()),
  );

  protected readonly visits = computed(() =>
    this.layout().visits.flatMap((block) => {
      const column = this.columnOf().get(block.visit.staffMemberId);
      if (!column) return [];
      const { startsAt, durationMin, services, description } = block.visit;
      const endsAt = new Date(startsAt).getTime() + durationMin * MINUTE_MS;
      const time = `${warsawClock(startsAt)}–${warsawClock(new Date(endsAt))}`;
      const details = services.length
        ? services.map((service) => service.name).join(', ')
        : (description ?? '');
      const noShow = block.visit.state === 'NO_SHOW';
      return [
        {
          block,
          column,
          time,
          details,
          noShow,
          label: [time, block.visit.client.name, details]
            .concat(noShow ? ['Nieodbyta'] : [])
            .filter(Boolean)
            .join(', '),
        },
      ];
    }),
  );

  protected readonly absences = computed(() =>
    this.layout().absences.flatMap((block) => {
      const column = this.columnOf().get(block.absence.staffMemberId);
      return column
        ? [
            {
              block,
              column,
              label: block.absence.reason || ABSENCE_DEFAULT_LABEL,
            },
          ]
        : [];
    }),
  );

  protected pick(staffMemberId: string, row: number): void {
    this.slotClick.emit({
      staffMemberId,
      startsAt: slotStartsAt(this.range(), row),
    });
  }
}

import {
  CdkDrag,
  CdkDragEnd,
  CdkDragMove,
  CdkDragStart,
  DragConstrainPosition,
  Point,
} from '@angular/cdk/drag-drop';
import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  ABSENCE_DEFAULT_LABEL,
  AbsenceView,
  CalendarDay,
  CalendarResponse,
  CalendarVisit,
  warsawDayStart,
} from '@bookit/shared';
import { GridColumn } from './calendar-columns';
import {
  alignedRanges,
  closedBlocks,
  DayLayout,
  DayRange,
  layoutDay,
  MINUTE_MS,
  nowRow,
  RowSpan,
  Slot,
  SLOT_MIN,
  slots,
  slotStartsAt,
  warsawClock,
} from './day-layout';
import {
  DragShift,
  movedVisit,
  moveRequest,
  replaceVisit,
  resizedVisit,
  snapMinutes,
  VisitMove,
} from './visit-drag';

/** An empty field of the grid that was clicked: the form of #30 starts from it. */
export interface CalendarSlot {
  staffMemberId: string;
  startsAt: Date;
}

/** CSS `grid-row` of `rows` rows from line `row`. */
const gridRow = (row: number, rows: number): string => `${row} / span ${rows}`;

/**
 * The dragged element stays where the grid puts it: the grid itself draws the Wizyta
 * at its new place, snapped to the quarters.
 */
const keepInPlace: DragConstrainPosition = (_point, _ref, rect) => ({
  x: rect.left,
  y: rect.top,
});

/** Where the pointer of `event` is on the page, scrolled part included. */
function pointerOf(event: MouseEvent | TouchEvent): Point {
  const point =
    'touches' in event ? (event.touches[0] ?? event.changedTouches[0]) : event;
  return { x: point.pageX, y: point.pageY };
}

/** On a touch screen a Wizyta is dragged after a long press, so the grid still scrolls. */
const DRAG_START_DELAY = { touch: 300, mouse: 0 };

interface Drag {
  kind: 'move' | 'resize';
  visit: CalendarVisit;
  /** The index of the column it is dragged from. */
  from: number;
  shift: DragShift;
  /** Measured when the drag starts. */
  pointer: Point;
  minutePx: number;
  columnPx: number;
}

/** What a day draws under the Wizyty, the same in all its columns. */
interface DayGrid {
  range: DayRange;
  slots: Slot[];
  closed: RowSpan[];
  /** The row of the line of the current hour. */
  now: number | null;
  layout: DayLayout;
}

/** The ranges of `days`, by day. */
const rangesOf = (
  days: CalendarDay[],
  visits: CalendarVisit[],
  calendar: CalendarResponse,
): Map<CalendarDay, DayRange> =>
  new Map(
    alignedRanges(days, visits, calendar.absences).map((r) => [r.day, r]),
  );

/**
 * The calendar grid from a list of columns, each one person on one day: the people of
 * a day (the day view), the days of a person (the week view) or one person (the phone).
 * Rows every minute with a line every 15; all days show the same clock times. Wizyty
 * of one person that overlap go side by side. When `editable`, a Wizyta is dragged to
 * another time or column, and its lower edge to another Czas trwania, in steps of 15 min.
 */
@Component({
  selector: 'app-calendar-day-grid',
  imports: [CdkDrag],
  template: `
    <div class="head" [style.--columns]="cells().length">
      <span></span>
      @for (cell of cells(); track cell.key) {
        <span class="column">
          <span class="name">{{ cell.label }}</span>
          @if (cell.holiday) {
            <span class="holiday">{{ cell.holiday }}</span>
          }
        </span>
      }
    </div>
    <div
      class="body"
      [style.--columns]="cells().length"
      [style.--minutes]="minutes()"
    >
      @for (slot of axis(); track slot.row) {
        @if (slot.hour) {
          <span class="time" [style.grid-row]="slot.row">{{ slot.label }}</span>
        }
      }
      @for (cell of cells(); track cell.key) {
        @for (block of cell.grid.closed; track block.row) {
          <div
            class="closed"
            [style.grid-column]="cell.column"
            [style.grid-row]="gridRow(block.row, block.rows)"
          ></div>
        }
        @for (slot of cell.grid.slots; track slot.row) {
          <!-- An Usunięta osoba z Personelu takes no new Wizyty. -->
          <button
            type="button"
            class="slot"
            [class.hour]="slot.hour"
            [style.grid-column]="cell.column"
            [style.grid-row]="gridRow(slot.row, slotMin)"
            [attr.aria-label]="cell.name + ', ' + slot.label"
            [disabled]="cell.deleted"
            (click)="pick(cell, slot.row)"
          ></button>
        }
        @if (cell.grid.now; as row) {
          <div
            class="now"
            [style.grid-column]="cell.column"
            [style.grid-row]="row"
            aria-hidden="true"
          ></div>
        }
      }
      @for (item of absences(); track item.key) {
        <button
          type="button"
          class="absence"
          [style.grid-column]="item.column"
          [style.grid-row]="gridRow(item.block.row, item.block.rows)"
          [attr.aria-label]="item.name"
          (click)="absenceClick.emit(item.block.absence)"
        >
          <span>{{ item.label }}</span>
        </button>
      }
      @for (item of visits(); track item.key) {
        <button
          type="button"
          class="visit"
          [class.no-show]="item.noShow"
          [class.dragged]="item.dragged"
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
          cdkDrag
          [cdkDragDisabled]="!item.movable"
          [cdkDragStartDelay]="dragStartDelay"
          [cdkDragConstrainPosition]="keepInPlace"
          (cdkDragStarted)="startDrag($event, 'move', item.visit, item.from)"
          (cdkDragMoved)="moveDrag($event)"
          (cdkDragEnded)="endDrag($event)"
          (click)="openVisit(item.visit)"
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
        @if (item.movable) {
          <!-- The mouse way to change the Czas trwania; the form is the other. -->
          <div
            class="resize"
            aria-hidden="true"
            [style.grid-column]="item.column"
            [style.grid-row]="gridRow(item.block.row, item.block.rows)"
            [style.--lane]="item.block.lane"
            [style.--lanes]="item.block.lanes"
            cdkDrag
            cdkDragLockAxis="y"
            [cdkDragStartDelay]="dragStartDelay"
            [cdkDragConstrainPosition]="keepInPlace"
            (cdkDragStarted)="
              startDrag($event, 'resize', item.visit, item.from)
            "
            (cdkDragMoved)="moveDrag($event)"
            (cdkDragEnded)="endDrag($event)"
          ></div>
        }
      }
    </div>
  `,
  styles: `
    :host {
      --axis: 48px;
      --minute: 1.6px;
      /* The week view takes it down to fit seven days. */
      --column-min: 120px;
      display: block;
    }
    .head,
    .body {
      display: grid;
      grid-template-columns: var(--axis) repeat(
          var(--columns),
          minmax(var(--column-min), 1fr)
        );
    }
    .head {
      position: sticky;
      top: 64px;
      z-index: 5;
      background: var(--mat-sys-surface);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .column {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 0;
      padding: 8px 4px;
    }
    .name,
    .holiday {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .name {
      font-weight: 600;
    }
    .holiday {
      padding: 0 6px;
      border-radius: 8px;
      font-size: 12px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
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
      all: unset;
      z-index: 2;
      /* A button centres what it holds; the reason goes at the top. */
      display: flex;
      align-items: flex-start;
      box-sizing: border-box;
      cursor: pointer;
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
    .absence:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
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
    .visit.cdk-drag:not(.cdk-drag-disabled) {
      cursor: grab;
    }
    .visit.dragged {
      z-index: 4;
      cursor: grabbing;
      opacity: 0.85;
    }
    .resize {
      z-index: 4;
      align-self: end;
      width: calc(100% / var(--lanes) - 4px);
      height: 8px;
      margin-left: calc(100% * var(--lane) / var(--lanes) + 2px);
      cursor: ns-resize;
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
      z-index: 4;
      border-top: 2px solid var(--mat-sys-error);
      pointer-events: none;
    }
  `,
})
export class CalendarDayGrid {
  /** The columns, left to right. */
  readonly columns = input.required<GridColumn[]>();
  readonly calendar = input.required<CalendarResponse>();
  /** The current time, for the line of the current hour. */
  readonly currentTime = input.required<Date>();
  /** Whether Wizyty can be dragged: only from 768 px. */
  readonly editable = input(false);

  /** A click in an empty field: the person and the start of its quarter. */
  readonly slotClick = output<CalendarSlot>();
  /** A click in a Wizyta, to open its card. */
  readonly visitClick = output<CalendarVisit>();
  /** A click in a Nieobecność, to edit or remove it. */
  readonly absenceClick = output<AbsenceView>();
  /** A Wizyta dragged to another time, column or Czas trwania. */
  readonly visitMove = output<VisitMove>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly drag = signal<Drag | null>(null);
  /** A drag ends with a click on the Wizyta, which must not open its card. */
  private suppressClick = false;

  protected readonly keepInPlace = keepInPlace;
  protected readonly dragStartDelay = DRAG_START_DELAY;

  protected readonly slotMin = SLOT_MIN;
  protected readonly gridRow = gridRow;

  private readonly days = computed(() => [
    ...new Set(this.columns().map((c) => c.day)),
  ]);

  /** The Wizyty of the people in the grid: only they set its hours. */
  private readonly ownVisits = computed(() => {
    const people = new Set(this.columns().map((c) => c.staffMemberId));
    return this.calendar().visits.filter((v) => people.has(v.staffMemberId));
  });

  /** The ranges without the drag, so a moved Wizyta stays inside them. */
  private readonly baseRanges = computed(() =>
    rangesOf(this.days(), this.ownVisits(), this.calendar()),
  );

  private readonly dragColumns = computed(() =>
    this.columns().map((column) => ({
      ...column,
      range: this.baseRanges().get(column.day) as DayRange,
    })),
  );

  /** The dragged Wizyta at its new place, `null` when nothing is dragged. */
  private readonly draggedVisit = computed(() => {
    const drag = this.drag();
    if (!drag) return null;
    return drag.kind === 'move'
      ? movedVisit(drag.visit, drag.shift, drag.from, this.dragColumns())
      : resizedVisit(drag.visit, drag.shift.minutes);
  });

  /** The calendar as drawn: with the dragged Wizyta where it is being dragged. */
  private readonly drawn = computed(() => {
    const dragged = this.draggedVisit();
    return dragged ? replaceVisit(this.calendar(), dragged) : this.calendar();
  });

  /** A longer Wizyta can grow them, a moved one never shrinks them under the pointer. */
  private readonly ranges = computed(() => {
    const dragged = this.draggedVisit();
    return dragged
      ? rangesOf(this.days(), [...this.ownVisits(), dragged], this.calendar())
      : this.baseRanges();
  });

  /** What each day draws under the Wizyty, by day. */
  private readonly dayGrids = computed(() => {
    const { openingHours } = this.calendar();
    const now = this.currentTime();
    const drawn = this.drawn();
    return new Map<CalendarDay, DayGrid>(
      [...this.ranges().values()].map((range) => [
        range.day,
        {
          range,
          slots: slots(range),
          closed: closedBlocks(range, openingHours),
          now: nowRow(range, now),
          layout: layoutDay(drawn.visits, drawn.absences, range),
        },
      ]),
    );
  });

  protected readonly cells = computed(() =>
    this.columns().map((column, index) => ({
      ...column,
      // The first grid column is the time axis.
      column: index + 2,
      index,
      grid: this.dayGrids().get(column.day) as DayGrid,
    })),
  );

  /** The clock times of the axis, from the first column. */
  protected readonly axis = computed(() => this.cells()[0]?.grid.slots ?? []);
  protected readonly minutes = computed(() =>
    Math.max(
      0,
      ...[...this.ranges().values()].map((r) => r.endMin - r.startMin),
    ),
  );

  protected readonly visits = computed(() => {
    const drag = this.drag();
    return this.cells().flatMap((cell) => {
      const firstMinute = slotStartsAt(cell.grid.range, 1).getTime();
      const dayStart = warsawDayStart(cell.day).getTime();
      return cell.grid.layout.visits
        .filter((block) => block.visit.staffMemberId === cell.staffMemberId)
        .map((block) => {
          const { startsAt, durationMin, services, description } = block.visit;
          const endsAt = new Date(startsAt).getTime() + durationMin * MINUTE_MS;
          const time = `${warsawClock(startsAt)}–${warsawClock(new Date(endsAt))}`;
          const details = services.length
            ? services.map((service) => service.name).join(', ')
            : (description ?? '');
          const noShow = block.visit.state === 'NO_SHOW';
          // The handlers get the Wizyta as it was before the drag.
          const before = drag?.visit.id === block.visit.id ? drag.visit : null;
          return {
            // The id alone, so a Wizyta dragged to another column keeps its element;
            // the part of one from the day before is another element.
            key:
              new Date(startsAt).getTime() >= dayStart
                ? block.visit.id
                : `${block.visit.id}@${cell.key}`,
            block,
            visit: before ?? block.visit,
            dragged: before !== null,
            // One cut by the grid (from the day before) is moved in the form.
            movable:
              this.editable() &&
              block.rows > 0 &&
              new Date(startsAt).getTime() >= firstMinute,
            column: cell.column,
            from: cell.index,
            time,
            details,
            noShow,
            label: [time, block.visit.client.name, details]
              .concat(noShow ? ['Nieodbyta'] : [])
              .filter(Boolean)
              .join(', '),
          };
        });
    });
  });

  protected readonly absences = computed(() =>
    this.cells().flatMap((cell) =>
      cell.grid.layout.absences
        .filter((block) => block.absence.staffMemberId === cell.staffMemberId)
        .map((block) => ({
          key: `${cell.key}:${block.absence.id}`,
          block,
          column: cell.column,
          label: block.absence.reason || ABSENCE_DEFAULT_LABEL,
          name: [ABSENCE_DEFAULT_LABEL, cell.name, block.absence.reason]
            .filter(Boolean)
            .join(', '),
        })),
    ),
  );

  protected openVisit(visit: CalendarVisit): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    this.visitClick.emit(visit);
  }

  protected startDrag(
    { event }: CdkDragStart,
    kind: Drag['kind'],
    visit: CalendarVisit,
    from: number,
  ): void {
    const slot = this.host.nativeElement
      .querySelector('.slot')
      ?.getBoundingClientRect();
    if (!slot) return;
    this.drag.set({
      kind,
      visit,
      from,
      shift: { minutes: 0, columns: 0 },
      pointer: pointerOf(event),
      minutePx: slot.height / SLOT_MIN,
      columnPx: slot.width,
    });
  }

  /** The `distance` of CDK is of the element, which `keepInPlace` holds still. */
  protected moveDrag({ event }: CdkDragMove): void {
    const drag = this.drag();
    if (!drag) return;
    const pointer = pointerOf(event);
    const minutes = snapMinutes(pointer.y - drag.pointer.y, drag.minutePx);
    const columns =
      drag.kind === 'move'
        ? Math.round((pointer.x - drag.pointer.x) / drag.columnPx) || 0
        : 0;
    if (minutes !== drag.shift.minutes || columns !== drag.shift.columns) {
      this.drag.set({ ...drag, shift: { minutes, columns } });
    }
  }

  protected endDrag({ source }: CdkDragEnd): void {
    source.reset();
    const before = this.drag()?.visit;
    const after = this.draggedVisit();
    this.drag.set(null);
    this.suppressClick = true;
    // No click came: the pointer was let go off the Wizyta.
    setTimeout(() => (this.suppressClick = false));
    if (before && after && Object.keys(moveRequest(before, after)).length) {
      this.visitMove.emit({ before, after });
    }
  }

  protected pick(
    cell: { staffMemberId: string; grid: DayGrid },
    row: number,
  ): void {
    this.slotClick.emit({
      staffMemberId: cell.staffMemberId,
      startsAt: slotStartsAt(cell.grid.range, row),
    });
  }
}

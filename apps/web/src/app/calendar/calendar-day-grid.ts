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
  shift: DragShift;
  /** Measured when the drag starts. */
  pointer: Point;
  minutePx: number;
  columnPx: number;
}

/**
 * The day view from 768 px: a column for every person who Przyjmuje Wizyty, rows every
 * minute with a line every 15. Wizyty of one person that overlap go side by side.
 * When `editable`, a Wizyta is dragged to another time or person, and its lower edge
 * to another Czas trwania, in steps of 15 min.
 */
@Component({
  selector: 'app-calendar-day-grid',
  imports: [CdkDrag],
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
          (cdkDragStarted)="startDrag($event, 'move', item.visit)"
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
            (cdkDragStarted)="startDrag($event, 'resize', item.visit)"
            (cdkDragMoved)="moveDrag($event)"
            (cdkDragEnded)="endDrag($event)"
          ></div>
        }
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
  /** Whether Wizyty can be dragged: only from 768 px. */
  readonly editable = input(false);

  /** A click in an empty field: the person and the start of its quarter. */
  readonly slotClick = output<CalendarSlot>();
  /** A click in a Wizyta, to open its card. */
  readonly visitClick = output<CalendarVisit>();
  /** A Wizyta dragged to another time, person or Czas trwania. */
  readonly visitMove = output<VisitMove>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly drag = signal<Drag | null>(null);
  /** A drag ends with a click on the Wizyta, which must not open its card. */
  private suppressClick = false;

  protected readonly keepInPlace = keepInPlace;
  protected readonly dragStartDelay = DRAG_START_DELAY;

  protected readonly slotMin = SLOT_MIN;
  protected readonly gridRow = gridRow;

  /** The range without the drag, so a moved Wizyta stays inside it. */
  private readonly baseRange = computed(() =>
    dayRange(this.day(), this.calendar().visits, this.calendar().absences),
  );

  /** The dragged Wizyta at its new place, `null` when nothing is dragged. */
  private readonly draggedVisit = computed(() => {
    const drag = this.drag();
    if (!drag) return null;
    return drag.kind === 'move'
      ? movedVisit(drag.visit, drag.shift, this.columns(), this.baseRange())
      : resizedVisit(drag.visit, drag.shift.minutes);
  });

  /** The calendar as drawn: with the dragged Wizyta where it is being dragged. */
  private readonly drawn = computed(() => {
    const dragged = this.draggedVisit();
    return dragged ? replaceVisit(this.calendar(), dragged) : this.calendar();
  });

  /** A longer Wizyta can grow it, a moved one never shrinks it under the pointer. */
  protected readonly range = computed(() => {
    const dragged = this.draggedVisit();
    const { visits, absences } = this.calendar();
    return dragged
      ? dayRange(this.day(), [...visits, dragged], absences)
      : this.baseRange();
  });
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
    layoutDay(this.drawn().visits, this.drawn().absences, this.range()),
  );

  protected readonly visits = computed(() => {
    const firstMinute = slotStartsAt(this.range(), 1).getTime();
    const drag = this.drag();
    return this.layout().visits.flatMap((block) => {
      const column = this.columnOf().get(block.visit.staffMemberId);
      if (!column) return [];
      const { startsAt, durationMin, services, description } = block.visit;
      const endsAt = new Date(startsAt).getTime() + durationMin * MINUTE_MS;
      const time = `${warsawClock(startsAt)}–${warsawClock(new Date(endsAt))}`;
      const details = services.length
        ? services.map((service) => service.name).join(', ')
        : (description ?? '');
      const noShow = block.visit.state === 'NO_SHOW';
      // The handlers get the Wizyta as it was before the drag.
      const before = drag?.visit.id === block.visit.id ? drag.visit : null;
      return [
        {
          block,
          visit: before ?? block.visit,
          dragged: before !== null,
          // One cut by the grid (from the day before) is moved in the form.
          movable:
            this.editable() &&
            block.rows > 0 &&
            new Date(startsAt).getTime() >= firstMinute,
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
    });
  });

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
  ): void {
    const slot = this.host.nativeElement
      .querySelector('.slot')
      ?.getBoundingClientRect();
    if (!slot) return;
    this.drag.set({
      kind,
      visit,
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

  protected pick(staffMemberId: string, row: number): void {
    this.slotClick.emit({
      staffMemberId,
      startsAt: slotStartsAt(this.range(), row),
    });
  }
}

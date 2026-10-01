import { BreakpointObserver } from '@angular/cdk/layout';
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import {
  form,
  FormField,
  maxLength,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogConfig,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  CalendarDay,
  CalendarStaffMember,
  CalendarVisit,
  ClientView,
  formatPrice,
  isVisitBreak,
  isVisitDuration,
  normalizeName,
  ServiceView,
  VISIT_BREAK_INVALID,
  VISIT_CLIENT_REQUIRED,
  VISIT_DESCRIPTION_MAX_LENGTH,
  VISIT_DESCRIPTION_REQUIRED,
  VISIT_DESCRIPTION_TOO_LONG,
  VISIT_DURATION_INVALID,
  VISIT_STAFF_REQUIRED,
  VISIT_STARTS_AT_INVALID,
  VisitCollision,
  VisitView,
  warsawDate,
  warsawTime,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';
import { ClientSearch } from '../clients/client-search';
import { ServiceCategoriesService } from '../settings/service-categories.service';
import { ServicesService } from '../settings/services.service';
import { errorMessage } from '../shared/error-message';
import { VisitCollisions } from './visit-collisions';
import {
  collisionsOf,
  createRequest,
  updateRequest,
  VisitFields,
} from './visit-request';
import {
  INITIAL_TIMING,
  QUICK_LENGTHS,
  quickLength,
  recalculate,
  TimedService,
  typedBreak,
  typedDuration,
  VisitTiming,
  withServices,
} from './visit-timing';
import { VisitsService } from './visits.service';

export interface VisitDialogData {
  /** The columns of the calendar: who can get a Wizyta, and the names of the rest. */
  staff: CalendarStaffMember[];
  /** The Wizyta to edit; without it the dialog adds a new one. */
  visit?: CalendarVisit;
  /** What a new Wizyta starts with, e.g. the field clicked in the calendar. */
  staffMemberId?: string;
  startsAt?: Date;
  /** The day of a new Wizyta without `startsAt`, e.g. the day the calendar shows. */
  day?: CalendarDay;
  client?: ClientView;
}

/** Below this the form takes the whole screen. */
export const PHONE_QUERY = '(max-width: 767.98px)';

/**
 * Opens the form, on the whole screen of a phone; resolves with the saved Wizyta,
 * `undefined` if cancelled.
 */
export function openVisitDialog(
  dialog: MatDialog,
  breakpoints: BreakpointObserver,
  data: VisitDialogData,
): Promise<VisitView | undefined> {
  const size: MatDialogConfig = breakpoints.isMatched(PHONE_QUERY)
    ? {
        width: '100vw',
        maxWidth: '100vw',
        height: '100dvh',
        maxHeight: '100dvh',
        panelClass: 'full-screen-dialog',
      }
    : { width: '640px' };
  return firstValueFrom(
    dialog
      .open<VisitDialog, VisitDialogData, VisitView>(VisitDialog, {
        ...size,
        data,
        autoFocus: data.visit ? 'dialog' : 'first-tabbable',
      })
      .afterClosed(),
  );
}

/** A Usługa on the Wizyta: one archived since is not in the Cennik, only its name is. */
interface PickedService {
  id: string;
  name: string;
}

interface CatalogGroup {
  id: string;
  name: string;
  services: ServiceView[];
}

/**
 * Adds or edits a Wizyta and saves it itself, so a `409` shows its Kolizje in the form
 * with "Zapisz mimo to". Picking Usługi suggests the Czas trwania and the Przerwa
 * (`visit-timing.ts`) until one is typed by hand.
 */
@Component({
  selector: 'app-visit-dialog',
  imports: [
    ClientSearch,
    FormField,
    MatAutocompleteModule,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    VisitCollisions,
  ],
  template: `
    <h2 mat-dialog-title>{{ visit ? 'Edycja Wizyty' : 'Nowa Wizyta' }}</h2>
    <form novalidate (submit)="$event.preventDefault(); save(false)">
      <mat-dialog-content>
        <app-client-search
          [client]="client()"
          (clientChange)="pickClient($event)"
        />
        @if (showError(f.clientId); as message) {
          <p class="field-error" role="alert">{{ message }}</p>
        }

        <mat-form-field appearance="outline">
          <mat-label>Osoba</mat-label>
          <mat-select [formField]="f.staffMemberId">
            @for (person of staffOptions; track person.id) {
              <mat-option [value]="person.id">{{ person.label }}</mat-option>
            }
          </mat-select>
          <mat-error>{{ firstError(f.staffMemberId) }}</mat-error>
        </mat-form-field>

        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Data</mat-label>
            <input matInput type="date" [formField]="f.day" />
            <mat-error>{{ firstError(f.day) }}</mat-error>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Godzina</mat-label>
            <input
              #timeInput
              matInput
              type="time"
              step="300"
              [formField]="f.time"
            />
            <mat-error>{{ firstError(f.time) }}</mat-error>
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Usługi</mat-label>
          <mat-chip-grid #chips aria-label="Wybrane Usługi">
            @for (service of picked(); track service.id) {
              <mat-chip-row (removed)="removeService(service.id)">
                {{ service.name }}
                <button
                  matChipRemove
                  [attr.aria-label]="'Usuń ' + service.name"
                >
                  <mat-icon>cancel</mat-icon>
                </button>
              </mat-chip-row>
            }
            <input
              #serviceInput
              [value]="serviceQuery()"
              (input)="serviceQuery.set(serviceInput.value)"
              [matChipInputFor]="chips"
              [matAutocomplete]="servicesAuto"
              autocomplete="off"
            />
          </mat-chip-grid>
          <mat-autocomplete
            #servicesAuto="matAutocomplete"
            (optionSelected)="addService($event, serviceInput)"
          >
            @for (group of catalogGroups(); track group.id) {
              <mat-optgroup [label]="group.name">
                @for (service of group.services; track service.id) {
                  <mat-option [value]="service">
                    <span class="option">
                      <span class="option-name">{{ service.name }}</span>
                      <span class="option-meta"
                        >{{ price(service) }} ·
                        {{ service.durationMin }} min</span
                      >
                    </span>
                  </mat-option>
                }
              </mat-optgroup>
            } @empty {
              <mat-option disabled>{{ catalogEmpty() }}</mat-option>
            }
          </mat-autocomplete>
          <mat-hint>Wpisz, aby wyszukać</mat-hint>
        </mat-form-field>

        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Czas trwania (min)</mat-label>
            <input
              matInput
              type="number"
              step="5"
              inputmode="numeric"
              [formField]="f.durationMin"
              (input)="durationTyped($any($event.target).valueAsNumber)"
            />
            <mat-error>{{ firstError(f.durationMin) }}</mat-error>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Przerwa (min)</mat-label>
            <input
              matInput
              type="number"
              step="5"
              inputmode="numeric"
              [formField]="f.breakMin"
              (input)="breakTyped($any($event.target).valueAsNumber)"
            />
            <mat-error>{{ firstError(f.breakMin) }}</mat-error>
          </mat-form-field>
        </div>
        <div class="lengths" role="group" aria-label="Szybkie długości">
          @for (length of quickLengths; track length) {
            <button
              mat-stroked-button
              type="button"
              [class.active]="model().durationMin === length"
              [attr.aria-pressed]="model().durationMin === length"
              (click)="quick(length)"
            >
              {{ length }} min
            </button>
          }
          @if (canRecalculate()) {
            <button mat-button type="button" (click)="recalculate()">
              <mat-icon>refresh</mat-icon>
              Przelicz z Usług
            </button>
          }
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Opis</mat-label>
          <textarea matInput rows="2" [formField]="f.description"></textarea>
          @if (!picked().length) {
            <mat-hint>Wymagany, gdy nie ma Usług</mat-hint>
          }
          <mat-error>{{ firstError(f.description) }}</mat-error>
        </mat-form-field>

        @if (collisions(); as list) {
          <app-visit-collisions [collisions]="list" />
        }
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        @if (collisions()) {
          <button mat-button type="button" (click)="changeTime()">
            Zmień termin
          </button>
          <button
            mat-flat-button
            type="button"
            [disabled]="pending()"
            (click)="save(true)"
          >
            Zapisz mimo to
          </button>
        } @else {
          <button mat-button type="button" mat-dialog-close>Anuluj</button>
          <button mat-flat-button type="submit" [disabled]="pending()">
            Zapisz
          </button>
        }
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: inherit;
    }
    form {
      display: contents;
    }
    mat-dialog-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    mat-form-field {
      width: 100%;
    }
    .row {
      display: flex;
      gap: 12px;
    }
    .row mat-form-field {
      flex: 1;
      min-width: 0;
    }
    .lengths {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: -4px 0 16px;
    }
    .lengths .active {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .option {
      display: flex;
      flex-direction: column;
    }
    .option-meta {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    .field-error {
      margin: -16px 0 12px 16px;
      font-size: 12px;
      color: var(--mat-sys-error);
    }
    .error {
      color: var(--mat-sys-error);
      margin: 8px 0 0;
    }
  `,
})
export class VisitDialog {
  private readonly api = inject(VisitsService);
  private readonly servicesApi = inject(ServicesService);
  private readonly categoriesApi = inject(ServiceCategoriesService);
  private readonly ref =
    inject<MatDialogRef<VisitDialog, VisitView>>(MatDialogRef);
  private readonly data = inject<VisitDialogData>(MAT_DIALOG_DATA);
  private readonly timeInput =
    viewChild.required<ElementRef<HTMLInputElement>>('timeInput');
  private readonly collisionsBox = viewChild(VisitCollisions, {
    read: ElementRef,
  });

  protected readonly visit = this.data.visit;
  protected readonly quickLengths = QUICK_LENGTHS;

  /** People who Przyjmują Wizyty; an Usunięta osoba only as the person of the edited one. */
  protected readonly staffOptions = this.data.staff
    .filter(
      (p) => p.visibleUntil === null || p.id === this.visit?.staffMemberId,
    )
    .map((p) => ({
      id: p.id,
      label: p.visibleUntil ? `${p.displayName} (usunięta)` : p.displayName,
    }));

  protected readonly client = signal<ClientView | null>(
    this.visit
      ? {
          id: this.visit.clientId,
          name: this.visit.client.name,
          phoneE164: this.visit.client.phoneE164,
          notes: null,
        }
      : (this.data.client ?? null),
  );

  protected readonly picked = signal<PickedService[]>(
    this.visit?.services.map((s) => ({ id: s.serviceId, name: s.name })) ?? [],
  );
  protected readonly serviceQuery = signal('');

  /** Whether the Czas trwania and Przerwa still follow the Usługi; editing starts with saved values. */
  private readonly auto = signal({
    autoDuration: !this.visit,
    autoBreak: !this.visit,
  });

  protected readonly model = signal(this.initialModel());

  protected readonly f = form(this.model, (s) => {
    required(s.clientId, { message: VISIT_CLIENT_REQUIRED });
    required(s.staffMemberId, { message: VISIT_STAFF_REQUIRED });
    required(s.day, { message: VISIT_STARTS_AT_INVALID });
    required(s.time, { message: VISIT_STARTS_AT_INVALID });
    validate(s.durationMin, ({ value }) =>
      isVisitDuration(value())
        ? undefined
        : { kind: 'duration', message: VISIT_DURATION_INVALID },
    );
    validate(s.breakMin, ({ value }) =>
      isVisitBreak(value())
        ? undefined
        : { kind: 'break', message: VISIT_BREAK_INVALID },
    );
    validate(s.description, ({ value }) =>
      !this.picked().length && !value().trim()
        ? { kind: 'required', message: VISIT_DESCRIPTION_REQUIRED }
        : undefined,
    );
    maxLength(s.description, VISIT_DESCRIPTION_MAX_LENGTH, {
      message: VISIT_DESCRIPTION_TOO_LONG,
    });
  });

  protected readonly catalog = resource({
    loader: () =>
      Promise.all([this.servicesApi.list(), this.categoriesApi.list()]),
  });

  private readonly byId = computed(
    () =>
      new Map(
        (this.catalog.hasValue() ? this.catalog.value()[0] : []).map((s) => [
          s.id,
          s,
        ]),
      ),
  );

  /** The Cennik by Kategoria, without the Usługi picked, filtered by what is typed. */
  protected readonly catalogGroups = computed<CatalogGroup[]>(() => {
    if (!this.catalog.hasValue()) return [];
    const [services, categories] = this.catalog.value();
    const query = normalizeName(this.serviceQuery());
    const picked = new Set(this.picked().map((s) => s.id));
    return categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        services: services.filter(
          (s) =>
            s.categoryId === category.id &&
            !picked.has(s.id) &&
            normalizeName(s.name).includes(query),
        ),
      }))
      .filter((group) => group.services.length);
  });

  protected readonly catalogEmpty = computed(() =>
    this.catalog.error()
      ? errorMessage(this.catalog.error())
      : this.catalog.isLoading()
        ? 'Wczytywanie…'
        : 'Brak pasujących Usług',
  );

  protected readonly canRecalculate = computed(() => {
    const { autoDuration, autoBreak } = this.auto();
    return (!autoDuration || !autoBreak) && this.timed().length > 0;
  });

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  /** The Kolizje of the last save, while the person and the time are the same. */
  private readonly lastCollisions = signal<{
    key: string;
    list: VisitCollision[];
  } | null>(null);
  protected readonly collisions = computed(() => {
    const last = this.lastCollisions();
    return last && last.key === this.slotKey() ? last.list : null;
  });

  protected readonly price = (s: ServiceView) =>
    formatPrice(s.priceGrosze, s.priceType);

  /** The picked Usługi that are in the Cennik, for the suggestion. */
  private readonly timed = computed<TimedService[]>(() =>
    this.picked().flatMap((p) => this.byId().get(p.id) ?? []),
  );

  private readonly slotKey = computed(() => {
    const m = this.model();
    return [m.staffMemberId, m.day, m.time, m.durationMin, m.breakMin].join();
  });

  constructor() {
    // The Kolizje come under the fields: bring them into view with "Zapisz mimo to".
    afterRenderEffect(() =>
      this.collisionsBox()?.nativeElement.scrollIntoView({ block: 'nearest' }),
    );
  }

  protected firstError(field: () => { errors(): { message?: string }[] }) {
    return field().errors()[0]?.message ?? '';
  }

  /** The error of a field without a `mat-form-field`, once it was touched. */
  protected showError(
    field: () => { errors(): { message?: string }[]; touched(): boolean },
  ): string | null {
    const state = field();
    return state.touched() ? (state.errors()[0]?.message ?? null) : null;
  }

  protected pickClient(client: ClientView | null): void {
    this.client.set(client);
    this.model.update((m) => ({ ...m, clientId: client?.id ?? '' }));
  }

  protected addService(
    event: MatAutocompleteSelectedEvent,
    input: HTMLInputElement,
  ): void {
    const service = event.option.value as ServiceView;
    this.picked.update((list) => [
      ...list,
      { id: service.id, name: service.name },
    ]);
    input.value = '';
    this.serviceQuery.set('');
    this.setTiming(withServices(this.timing(), this.timed()));
  }

  protected removeService(id: string): void {
    this.picked.update((list) => list.filter((s) => s.id !== id));
    this.setTiming(withServices(this.timing(), this.timed()));
  }

  /** Takes the typed value from the event: `[formField]` may write the model after this. */
  protected durationTyped(min: number): void {
    this.setTiming(typedDuration(this.timing(), min));
  }

  protected breakTyped(min: number): void {
    this.setTiming(typedBreak(this.timing(), min));
  }

  protected quick(length: number): void {
    this.setTiming(quickLength(this.timing(), length));
  }

  protected recalculate(): void {
    this.setTiming(recalculate(this.timing(), this.timed()));
  }

  /** "Zmień termin": back to the time; the Kolizje stay until it changes. */
  protected changeTime(): void {
    this.timeInput().nativeElement.focus();
  }

  protected async save(acceptCollisions: boolean): Promise<void> {
    if (this.pending()) return;
    await submit(this.f, async () => {
      await this.send(acceptCollisions);
      return undefined;
    });
  }

  private async send(acceptCollisions: boolean): Promise<void> {
    const fields: VisitFields = {
      ...this.model(),
      serviceIds: this.picked().map((s) => s.id),
    };
    const body = createRequest(fields);
    const key = this.slotKey();
    this.pending.set(true);
    this.error.set(null);
    try {
      if (this.visit) {
        const changes = updateRequest(this.visit, body);
        if (!Object.keys(changes).length) {
          this.ref.close(this.visit);
          return;
        }
        this.ref.close(
          await this.api.update(this.visit.id, {
            ...changes,
            ...(acceptCollisions && { acceptCollisions }),
          }),
        );
      } else {
        this.ref.close(
          await this.api.create({
            ...body,
            ...(acceptCollisions && { acceptCollisions }),
          }),
        );
      }
    } catch (error) {
      const list = collisionsOf(error);
      if (list) this.lastCollisions.set({ key, list });
      else this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private timing(): VisitTiming {
    const { durationMin, breakMin } = this.model();
    return { durationMin, breakMin, ...this.auto() };
  }

  private setTiming({
    durationMin,
    breakMin,
    autoDuration,
    autoBreak,
  }: VisitTiming): void {
    this.model.update((m) => ({ ...m, durationMin, breakMin }));
    this.auto.set({ autoDuration, autoBreak });
  }

  private initialModel(): Omit<VisitFields, 'serviceIds'> {
    const { visit, staffMemberId, startsAt, day } = this.data;
    const only = this.staffOptions.length === 1 ? this.staffOptions[0].id : '';
    const start = visit?.startsAt ?? startsAt;
    return {
      clientId: this.client()?.id ?? '',
      staffMemberId: visit?.staffMemberId ?? staffMemberId ?? only,
      day: start ? warsawDate(new Date(start)) : (day ?? ''),
      time: start ? warsawTime(start) : '',
      durationMin: visit?.durationMin ?? INITIAL_TIMING.durationMin,
      breakMin: visit?.breakMin ?? INITIAL_TIMING.breakMin,
      description: visit?.description ?? '',
    };
  }
}

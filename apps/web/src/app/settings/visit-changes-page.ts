import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  CalendarDay,
  ClientView,
  StaffMemberView,
  VisitChangePage,
} from '@bookit/shared';
import { ClientSearch } from '../clients/client-search';
import { errorMessage } from '../shared/error-message';
import { StaffService } from './staff.service';
import { VisitChangeList } from './visit-change-list';
import { VisitChangesService } from './visit-changes.service';

/**
 * `/panel/ustawienia/historia`: the Właściciel sees who created, changed, cancelled or
 * deleted a Wizyta, filtered by the day of the change, who made it and the Klient.
 */
@Component({
  selector: 'app-visit-changes-page',
  imports: [
    ClientSearch,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    VisitChangeList,
  ],
  template: `
    <h1>Historia zmian</h1>
    <p class="intro">
      Kto i kiedy dodał, zmienił, odwołał albo usunął Wizytę. Widzisz ją tylko
      Ty.
    </p>

    <div class="filters">
      <mat-form-field appearance="outline">
        <mat-label>Dzień zmiany</mat-label>
        <input
          matInput
          type="date"
          name="day"
          [value]="day()"
          (change)="setDay($any($event.target).value)"
        />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Kto zmienił</mat-label>
        <select
          matNativeControl
          name="staffId"
          [value]="staffId()"
          (change)="setStaffId($any($event.target).value)"
        >
          <option value="">Wszyscy</option>
          @for (person of staff(); track person.id) {
            <option [value]="person.id">{{ person.displayName }}</option>
          }
        </select>
      </mat-form-field>
      <app-client-search
        class="client"
        [canAddNew]="false"
        [client]="client()"
        (clientChange)="setClient($event)"
      />
      @if (filtered()) {
        <button mat-button (click)="clear()">
          <mat-icon>filter_alt_off</mat-icon>
          Wyczyść filtry
        </button>
      }
    </div>

    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }
    @if (result(); as result) {
      @if (result.items.length) {
        <app-visit-change-list [changes]="result.items" />
        <div class="pages">
          <span>{{ range() }}</span>
          <button
            mat-button
            [disabled]="loading() || result.page === 1"
            (click)="load(result.page - 1)"
          >
            Poprzednia
          </button>
          <button
            mat-button
            [disabled]="
              loading() || result.page * result.pageSize >= result.total
            "
            (click)="load(result.page + 1)"
          >
            Następna
          </button>
        </div>
      } @else {
        <p class="empty">Brak zmian dla tych filtrów.</p>
      }
    } @else if (!error()) {
      <mat-spinner diameter="32" aria-label="Wczytywanie" />
    }
  `,
  styles: `
    h1 {
      margin: 0;
    }
    .intro {
      margin: 8px 0 16px;
      color: var(--mat-sys-on-surface-variant);
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0 12px;
      align-items: flex-start;
    }
    .filters > * {
      flex: 1 1 200px;
    }
    .filters > button {
      flex: none;
      margin-top: 8px;
    }
    .pages {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: flex-end;
      margin-top: 8px;
      color: var(--mat-sys-on-surface-variant);
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class VisitChangesPage implements OnInit {
  private readonly api = inject(VisitChangesService);
  private readonly staffApi = inject(StaffService);

  protected readonly staff = signal<StaffMemberView[]>([]);
  protected readonly day = signal<CalendarDay>('');
  protected readonly staffId = signal('');
  protected readonly client = signal<ClientView | null>(null);
  protected readonly result = signal<VisitChangePage | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);

  protected readonly filtered = computed(
    () => !!(this.day() || this.staffId() || this.client()),
  );

  /** `1–50 z 120` */
  protected readonly range = computed(() => {
    const result = this.result();
    if (!result) return '';
    const first = (result.page - 1) * result.pageSize + 1;
    return `${first}–${first + result.items.length - 1} z ${result.total}`;
  });

  /** The last request, so an older reply does not overwrite a newer one. */
  private request = 0;

  async ngOnInit(): Promise<void> {
    // The filter works without the list of people, so its error is not shown.
    this.staffApi.list().then(
      (staff) => this.staff.set(staff),
      () => undefined,
    );
    await this.load(1);
  }

  protected setDay(day: CalendarDay): void {
    this.day.set(day);
    void this.load(1);
  }

  protected setStaffId(staffId: string): void {
    this.staffId.set(staffId);
    void this.load(1);
  }

  protected setClient(client: ClientView | null): void {
    // Typing clears the picked Klient; only reload when that changes the filter.
    if (client?.id === this.client()?.id) return;
    this.client.set(client);
    void this.load(1);
  }

  protected clear(): void {
    this.day.set('');
    this.staffId.set('');
    this.client.set(null);
    void this.load(1);
  }

  protected async load(page: number): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.list({
        day: this.day() || undefined,
        staffId: this.staffId() || undefined,
        clientId: this.client()?.id,
        page,
      });
      if (request === this.request) this.result.set(result);
    } catch (error) {
      if (request === this.request) this.error.set(errorMessage(error));
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}

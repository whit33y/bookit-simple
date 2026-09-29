import { Location } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { AdminSalonSummary } from '@bookit/shared';
import { errorMessage } from '../shared/error-message';
import { AdminSalonsService } from './admin-salons.service';
import { SalonCreatedState } from './new-salon-page';
import { InvitationStatusBadge, SalonStatusBadge } from './salon-status';

/** Lowercased without Polish diacritics, so "lodz" finds "Łódź". */
export function searchKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type SalonFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'PENDING';

const FILTERS: { value: SalonFilter; label: string }[] = [
  { value: 'ALL', label: 'Wszystkie' },
  { value: 'ACTIVE', label: 'Aktywne' },
  { value: 'SUSPENDED', label: 'Zawieszone' },
  { value: 'PENDING', label: 'Zaproszenie oczekuje' },
];

function matches(salon: AdminSalonSummary, filter: SalonFilter): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'PENDING':
      return !!salon.owner && !salon.owner.invitationAccepted;
    default:
      return salon.status === filter;
  }
}

/** `/admin`: every Salon, searchable by name and filtered by status. */
@Component({
  selector: 'app-salons-page',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    InvitationStatusBadge,
    RouterLink,
    SalonStatusBadge,
  ],
  template: `
    <div class="head">
      <h1>Salony</h1>
      <a mat-flat-button routerLink="/admin/salony/nowy">
        <mat-icon>add</mat-icon>
        Nowy Salon
      </a>
    </div>
    @if (created; as created) {
      <p class="info" role="status">
        Salon {{ created.name }} został założony. Zaproszenie poszło na
        {{ created.ownerEmail }}.
      </p>
    }
    <div class="toolbar">
      <mat-form-field
        class="search"
        appearance="outline"
        subscriptSizing="dynamic"
      >
        <mat-icon matPrefix>search</mat-icon>
        <mat-label>Szukaj po nazwie</mat-label>
        <input
          matInput
          type="search"
          [value]="query()"
          (input)="search($event)"
        />
      </mat-form-field>
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        aria-label="Pokaż"
        [value]="filter()"
        (change)="filter.set($event.value)"
      >
        @for (option of filters; track option.value) {
          <mat-button-toggle [value]="option.value">
            {{ option.label }} {{ counts()[option.value] }}
          </mat-button-toggle>
        }
      </mat-button-toggle-group>
    </div>

    @if (loadError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else if (salons() === null) {
      <mat-spinner diameter="32" aria-label="Wczytywanie" />
    } @else if (salons()!.length === 0) {
      <p class="empty">Nie ma jeszcze żadnego Salonu.</p>
    } @else if (visible().length === 0) {
      <p class="empty">Żaden Salon nie pasuje do wyszukiwania.</p>
    } @else {
      <div class="list" role="table" aria-label="Salony">
        <div class="row header" role="row">
          <span role="columnheader">Nazwa</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">E-mail Właściciela</span>
          <span role="columnheader">Zaproszenie</span>
        </div>
        @for (salon of visible(); track salon.id) {
          <div class="row" role="row">
            <span role="cell" class="main">
              <a class="name" [routerLink]="['/admin/salony', salon.id]">{{
                salon.name
              }}</a>
              <span class="muted">/{{ salon.slug }}</span>
            </span>
            <span role="cell"
              ><app-salon-status [status]="salon.status"
            /></span>
            <span role="cell" class="email">{{
              salon.owner?.email ?? '—'
            }}</span>
            <span role="cell">
              @if (salon.owner; as owner) {
                <app-invitation-status [accepted]="owner.invitationAccepted" />
              }
            </span>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .info {
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .error {
      color: var(--mat-sys-error);
    }
    .empty,
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin: 16px 0;
    }
    .search {
      flex: 1 1 260px;
      max-width: 400px;
    }
    mat-button-toggle-group {
      overflow-x: auto;
      max-width: 100%;
    }
    .list {
      display: flex;
      flex-direction: column;
      font-size: 14px;
    }
    .row {
      position: relative;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 4px 12px;
      padding: 12px 8px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      color: inherit;
      text-decoration: none;
    }
    .row:not(.header):hover {
      background: var(--mat-sys-surface-container-low);
    }
    .header {
      display: none;
      font-size: 12px;
      font-weight: 600;
      color: var(--mat-sys-on-surface-variant);
    }
    .main {
      display: flex;
      flex-direction: column;
    }
    .name {
      font-weight: 600;
      color: inherit;
      text-decoration: none;
    }
    /* The whole row opens the Salon; only the name is the link for screen readers. */
    .name::after {
      content: '';
      position: absolute;
      inset: 0;
    }
    .name:focus-visible {
      outline: none;
    }
    .row:has(.name:focus-visible) {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: -2px;
    }
    .email {
      overflow-wrap: anywhere;
    }
    @media (min-width: 768px) {
      .row {
        grid-template-columns: 2fr 1fr 2fr 1fr;
      }
      .header {
        display: grid;
      }
    }
  `,
})
export class SalonsPage implements OnInit {
  private readonly api = inject(AdminSalonsService);
  private readonly location = inject(Location);

  protected readonly filters = FILTERS;
  protected readonly salons = signal<AdminSalonSummary[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly filter = signal<SalonFilter>('ALL');

  /** Matching the search; the filter buttons count these. */
  private readonly found = computed(() => {
    const query = searchKey(this.query());
    return (this.salons() ?? []).filter((salon) =>
      searchKey(salon.name).includes(query),
    );
  });
  protected readonly visible = computed(() =>
    this.found().filter((salon) => matches(salon, this.filter())),
  );
  protected readonly counts = computed(() => {
    const found = this.found();
    return Object.fromEntries(
      FILTERS.map(({ value }) => [
        value,
        found.filter((salon) => matches(salon, value)).length,
      ]),
    ) as Record<SalonFilter, number>;
  });

  /** Set by the new-Salon form when it navigates here. */
  protected readonly created = (
    this.location.getState() as Partial<SalonCreatedState> | null
  )?.created;

  constructor() {
    // Shown once: a reload of /admin should not announce the Salon again.
    if (this.created) this.location.replaceState(this.location.path());
  }

  async ngOnInit(): Promise<void> {
    try {
      this.salons.set(await this.api.list());
    } catch (error) {
      this.loadError.set(errorMessage(error));
    }
  }

  protected search(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}

import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import {
  ClientView,
  ClientVisit,
  ClientVisitPage,
  formatPhone,
  formatWarsawDate,
  formatWarsawDateTime,
  visitStateLabel,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { errorMessage } from '../shared/error-message';
import { CLIENTS_PATH, NEW_VISIT_CLIENT_PARAM } from './client-links';
import { ClientsService } from './clients.service';
import {
  DeleteClientDialog,
  DeleteClientDialogData,
} from './delete-client-dialog';

const NOT_FOUND = 'Nie ma takiego Klienta w Kartotece.';

/**
 * `/panel/klienci/:id`: the karta Klienta. Their data, notes and stats, and every Wizyta,
 * also cancelled and no-show ones, newest first. Only the Właściciel deletes.
 */
@Component({
  selector: 'app-client-card-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RouterLink,
  ],
  template: `
    <a mat-button [routerLink]="clientsPath" class="back">
      <mat-icon>arrow_back</mat-icon>
      Klienci
    </a>

    @if (client(); as client) {
      <div class="top">
        <h1>{{ client.name }}</h1>
        <div class="actions">
          <a
            mat-flat-button
            routerLink="/panel/kalendarz"
            [queryParams]="newVisitParams()"
          >
            <mat-icon>event</mat-icon>
            Nowa Wizyta
          </a>
          @if (isOwner()) {
            <button mat-button [disabled]="busy()" (click)="remove(client)">
              <mat-icon>delete</mat-icon>
              Usuń Klienta
            </button>
          }
        </div>
      </div>

      @if (client.phoneE164) {
        <a class="phone" [href]="'tel:' + client.phoneE164">{{
          formatPhone(client.phoneE164)
        }}</a>
      }
      @if (client.notes) {
        <p class="notes">{{ client.notes }}</p>
      }
    }

    @if (clientError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }
    @if (actionError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    @if (visits(); as result) {
      <dl class="stats">
        <div>
          <dt>Wizyty</dt>
          <dd>{{ result.stats.visits }}</dd>
        </div>
        <div>
          <dt>Odwołane</dt>
          <dd>{{ result.stats.cancelled }}</dd>
        </div>
        <div>
          <dt>Nieodbyte</dt>
          <dd>{{ result.stats.noShow }}</dd>
        </div>
        <div>
          <dt>Ostatnia Wizyta</dt>
          <dd>
            {{
              result.stats.lastVisitAt
                ? formatDate(result.stats.lastVisitAt)
                : 'brak'
            }}
          </dd>
        </div>
      </dl>

      <h2>Wizyty</h2>
      @if (visitsError(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      @if (result.total) {
        <ul class="list" aria-label="Wizyty">
          @for (item of result.items; track item.id) {
            <li class="visit" [class]="item.state.toLowerCase()">
              <span class="when">
                {{ formatDateTime(item.startsAt) }} ·
                <span class="state">{{ stateLabel(item) }}</span>
              </span>
              <span class="what">{{ summary(item) }}</span>
              <span class="who">{{ staffName(item) }}</span>
            </li>
          }
        </ul>
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
        <p class="empty">Ten Klient nie ma jeszcze Wizyt.</p>
      }
    } @else if (visitsError(); as message) {
      @if (message !== clientError()) {
        <p class="error" role="alert">{{ message }}</p>
      }
    } @else {
      <mat-spinner diameter="32" aria-label="Wczytywanie" />
    }
  `,
  styles: `
    .back {
      margin: 0 0 8px -12px;
    }
    .top {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      align-items: center;
      justify-content: space-between;
    }
    h1 {
      margin: 0;
      overflow-wrap: anywhere;
    }
    h2 {
      margin: 24px 0 8px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .phone {
      display: inline-block;
      margin-top: 8px;
      color: var(--mat-sys-primary);
      text-decoration: none;
    }
    .notes {
      margin: 8px 0 0;
      white-space: pre-line;
      overflow-wrap: anywhere;
      color: var(--mat-sys-on-surface-variant);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin: 24px 0 0;
    }
    .stats div {
      padding: 12px 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
    }
    .stats dt {
      color: var(--mat-sys-on-surface-variant);
    }
    .stats dd {
      margin: 4px 0 0;
      font-size: 1.25rem;
      font-weight: 600;
    }
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
      overflow: hidden;
    }
    .visit {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 16px;
      background: var(--mat-sys-surface);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .visit:last-child {
      border-bottom: 0;
    }
    .when {
      font-weight: 600;
    }
    .cancelled .state,
    .no_show .state {
      color: var(--mat-sys-error);
    }
    .what {
      overflow-wrap: anywhere;
    }
    .who {
      color: var(--mat-sys-on-surface-variant);
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
export class ClientCardPage implements OnInit {
  private readonly api = inject(ClientsService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly me = inject(AuthService).me;

  readonly id = input.required<string>();

  protected readonly clientsPath = CLIENTS_PATH;
  protected readonly formatPhone = formatPhone;
  protected readonly formatDate = formatWarsawDate;
  protected readonly formatDateTime = formatWarsawDateTime;
  protected readonly isOwner = computed(() => this.me()?.role === 'OWNER');
  protected readonly newVisitParams = computed(() => ({
    [NEW_VISIT_CLIENT_PARAM]: this.id(),
  }));

  protected readonly client = signal<ClientView | null>(null);
  protected readonly visits = signal<ClientVisitPage | null>(null);
  /** Each load and action has its own error, so one success does not hide another's failure. */
  protected readonly clientError = signal<string | null>(null);
  protected readonly visitsError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);

  /** `1–20 z 45` */
  protected readonly range = computed(() => {
    const result = this.visits();
    if (!result) return '';
    const first = (result.page - 1) * result.pageSize + 1;
    return `${first}–${first + result.items.length - 1} z ${result.total}`;
  });

  /** The last request, so an older reply does not overwrite a newer one. */
  private request = 0;

  async ngOnInit(): Promise<void> {
    const [client] = await Promise.all([
      this.api.get(this.id()).catch((error: unknown) => {
        this.clientError.set(loadError(error));
        return null;
      }),
      this.load(1),
    ]);
    this.client.set(client);
  }

  protected async load(page: number): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    try {
      const result = await this.api.visits(this.id(), page);
      if (request === this.request) {
        this.visits.set(result);
        this.visitsError.set(null);
      }
    } catch (error) {
      if (request === this.request) this.visitsError.set(loadError(error));
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  protected stateLabel(visit: ClientVisit): string {
    return visitStateLabel(visit, new Date());
  }

  /** The Usługi, then the description. */
  protected summary(visit: ClientVisit): string {
    const services = visit.services.map((service) => service.name).join(', ');
    return [services, visit.description].filter(Boolean).join(' · ');
  }

  protected staffName({ staffMember }: ClientVisit): string {
    return staffMember.deleted
      ? `${staffMember.displayName} (usunięta)`
      : staffMember.displayName;
  }

  protected async remove(client: ClientView): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<DeleteClientDialog, DeleteClientDialogData, boolean>(
          DeleteClientDialog,
          { data: { name: client.name } },
        )
        .afterClosed(),
    );
    if (!confirmed) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.api.remove(client.id);
      await this.router.navigateByUrl(CLIENTS_PATH);
    } catch (error) {
      this.actionError.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

function loadError(error: unknown): string {
  return error instanceof HttpErrorResponse && error.status === 404
    ? NOT_FOUND
    : errorMessage(error);
}

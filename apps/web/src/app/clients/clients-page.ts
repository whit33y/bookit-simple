import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CLIENT_SEARCH_LIMIT, ClientView, formatPhone } from '@bookit/shared';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { errorMessage } from '../shared/error-message';
import { ClientDialogData, openClientDialog } from './client-dialog';
import { ClientsService } from './clients.service';
import {
  DeleteClientDialog,
  DeleteClientDialogData,
} from './delete-client-dialog';

/**
 * `/panel/klienci`: the Kartoteka Klientów. The Personel searches, adds and edits;
 * only the Właściciel deletes. The card with the history of Wizyty comes in #33.
 */
@Component({
  selector: 'app-clients-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="top">
      <h1>Klienci</h1>
      <button mat-flat-button (click)="add()">
        <mat-icon>person_add</mat-icon>
        Dodaj Klienta
      </button>
    </div>

    <mat-form-field appearance="outline" class="search">
      <mat-icon matIconPrefix>search</mat-icon>
      <mat-label>Szukaj po imieniu lub telefonie</mat-label>
      <input
        matInput
        type="search"
        autocomplete="off"
        (input)="query$.next($any($event.target).value)"
      />
    </mat-form-field>

    @if (actionError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    @if (clients(); as clients) {
      @if (clients.length) {
        <ul class="list" aria-label="Klienci">
          @for (item of clients; track item.id) {
            <li class="row" [attr.aria-label]="item.name">
              <div class="text">
                <span class="name">{{ item.name }}</span>
                @if (item.phoneE164) {
                  <a class="phone" [href]="'tel:' + item.phoneE164">{{
                    formatPhone(item.phoneE164)
                  }}</a>
                }
                @if (item.notes) {
                  <span class="notes">{{ item.notes }}</span>
                }
              </div>
              <div class="actions">
                <button
                  mat-icon-button
                  (click)="edit(item)"
                  [attr.aria-label]="'Edytuj: ' + item.name"
                  matTooltip="Edytuj"
                >
                  <mat-icon>edit</mat-icon>
                </button>
                @if (isOwner()) {
                  <button
                    mat-icon-button
                    [disabled]="busy()"
                    (click)="remove(item)"
                    [attr.aria-label]="'Usuń: ' + item.name"
                    matTooltip="Usuń"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                }
              </div>
            </li>
          }
        </ul>
        @if (clients.length >= limit) {
          <p class="more">
            Widać pierwszych {{ limit }}. Wpisz imię lub numer, żeby znaleźć
            pozostałych.
          </p>
        }
      } @else if (query()) {
        <p class="empty">Nikt nie pasuje do „{{ query() }}”.</p>
      } @else {
        <p class="empty">Kartoteka jest pusta. Dodaj pierwszego Klienta.</p>
      }
    } @else if (loadError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else {
      <mat-spinner diameter="32" aria-label="Wczytywanie" />
    }
  `,
  styles: `
    .top {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    h1 {
      margin: 0;
    }
    .search {
      width: 100%;
      max-width: 480px;
    }
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
      overflow: hidden;
    }
    .row {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 8px 8px 8px 16px;
      background: var(--mat-sys-surface);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .row:last-child {
      border-bottom: 0;
    }
    .text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .name {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .phone {
      color: var(--mat-sys-primary);
      text-decoration: none;
      width: fit-content;
    }
    .notes {
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .actions {
      flex: none;
      display: flex;
    }
    .more,
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class ClientsPage {
  private readonly api = inject(ClientsService);
  private readonly dialog = inject(MatDialog);
  private readonly me = inject(AuthService).me;

  protected readonly formatPhone = formatPhone;
  protected readonly limit = CLIENT_SEARCH_LIMIT;
  protected readonly isOwner = computed(() => this.me()?.role === 'OWNER');

  protected readonly query$ = new BehaviorSubject('');
  /** The query the list shows the answer to. */
  protected readonly query = signal('');
  protected readonly clients = signal<ClientView[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    this.api
      .searchWhileTyping(this.query$)
      .pipe(takeUntilDestroyed())
      .subscribe((result) => {
        this.query.set(result.query);
        if (result.clients) {
          this.clients.set(result.clients);
          this.loadError.set(null);
        } else {
          this.clients.set(null);
          this.loadError.set(result.error);
        }
      });
  }

  protected async add(): Promise<void> {
    const saved = await this.openDialog({});
    if (saved) this.clients.update((list) => [saved, ...(list ?? [])]);
  }

  protected async edit(client: ClientView): Promise<void> {
    const saved = await this.openDialog({ client });
    if (!saved) return;
    this.clients.update(
      (list) => list?.map((c) => (c.id === saved.id ? saved : c)) ?? null,
    );
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
      this.clients.update(
        (list) => list?.filter((c) => c.id !== client.id) ?? null,
      );
    } catch (error) {
      this.actionError.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private openDialog(data: ClientDialogData): Promise<ClientView | undefined> {
    return openClientDialog(this.dialog, data);
  }
}

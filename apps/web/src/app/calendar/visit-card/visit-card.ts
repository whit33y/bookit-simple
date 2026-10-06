import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import {
  CalendarStaffMember,
  CalendarVisit,
  DELETED_CLIENT_NAME,
  formatPhone,
  formatPrice,
  formatWarsawDate,
  VisitCollision,
  VisitView,
  visitStateLabel,
  warsawTime,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { clientCardPath } from '../../clients/client-links';
import { VisitChangeList } from '../../settings/visit-history/visit-change-list/visit-change-list';
import { VisitChangesService } from '../../settings/visit-history/visit-changes.service';
import { errorMessage } from '../../shared/error-message';
import { MINUTE_MS } from '../day-layout';
import { DeleteVisitDialog } from '../delete-visit-dialog/delete-visit-dialog';
import { VisitCollisions } from '../visit-collisions/visit-collisions';
import { collisionsOf } from '../visit-request';
import { VisitsService } from '../visits.service';

export interface VisitCardData {
  visit: CalendarVisit;
  /** The columns of the calendar, for the name of the person. */
  staff: CalendarStaffMember[];
}

/**
 * What the card closes with: `edit` to open the form of the Wizyta. Changes of its Stan
 * Wizyty are saved at once, so the calendar reloads after any close.
 */
export type VisitCardResult = { edit: CalendarVisit } | undefined;

/** Opens the karta Wizyty. */
export function openVisitCard(
  dialog: MatDialog,
  data: VisitCardData,
): Promise<VisitCardResult> {
  return firstValueFrom(
    dialog
      .open<VisitCard, VisitCardData, VisitCardResult>(VisitCard, {
        data,
        width: '560px',
        autoFocus: 'dialog',
      })
      .afterClosed(),
  );
}

type Action = 'cancel' | 'noShow' | 'restore' | 'remove';

/**
 * The karta Wizyty: its details and what can be done with it in its Stan Wizyty. The
 * Właściciel also has the Historia tab. Changes are saved at once and stay in the card.
 */
@Component({
  selector: 'app-visit-card',
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    NgTemplateOutlet,
    RouterLink,
    VisitChangeList,
    VisitCollisions,
  ],
  template: `
    <div class="title">
      <h2 mat-dialog-title>
        @if (clientLink(); as link) {
          <a [routerLink]="link" mat-dialog-close>{{ visit().client.name }}</a>
        } @else {
          {{ visit().client.name }}
        }
      </h2>
      <button mat-icon-button mat-dialog-close aria-label="Zamknij">
        <mat-icon>close</mat-icon>
      </button>
    </div>
    <mat-dialog-content>
      @if (isOwner) {
        <mat-tab-group
          mat-stretch-tabs="false"
          (selectedIndexChange)="historyOpened.set($event === 1)"
        >
          <mat-tab label="Szczegóły">
            <ng-container [ngTemplateOutlet]="details" />
          </mat-tab>
          <mat-tab label="Historia">
            <div class="history">
              @if (history.error()) {
                <p class="error" role="alert">{{ historyError() }}</p>
              } @else if (history.hasValue()) {
                <app-visit-change-list [changes]="history.value()" />
              } @else {
                <mat-spinner diameter="32" aria-label="Wczytywanie" />
              }
            </div>
          </mat-tab>
        </mat-tab-group>
      } @else {
        <ng-container [ngTemplateOutlet]="details" />
      }

      <ng-template #details>
        <dl class="details">
          <div>
            <dt>Stan</dt>
            <dd class="state" [class]="visit().state.toLowerCase()">
              {{ stateLabel() }}
            </dd>
          </div>
          <div>
            <dt>Data i godzina</dt>
            <dd>{{ when() }}</dd>
          </div>
          <div>
            <dt>Osoba</dt>
            <dd>{{ staffName() }}</dd>
          </div>
          @if (visit().client.phoneE164; as phone) {
            <div>
              <dt>Telefon</dt>
              <dd>
                <a [href]="'tel:' + phone">{{ formatPhone(phone) }}</a>
              </dd>
            </div>
          }
          <div>
            <dt>Usługi</dt>
            <dd>
              @if (visit().services.length) {
                <ul class="services">
                  @for (service of visit().services; track service.serviceId) {
                    <li>
                      <span>{{ service.name }}</span>
                      <span class="price">{{ price(service) }}</span>
                    </li>
                  }
                </ul>
              } @else {
                brak
              }
            </dd>
          </div>
          @if (visit().description; as description) {
            <div>
              <dt>Opis</dt>
              <dd class="description">{{ description }}</dd>
            </div>
          }
        </dl>
      </ng-template>

      @if (collisions(); as list) {
        <app-visit-collisions [collisions]="list" />
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      @if (collisions()) {
        <button mat-button (click)="collisions.set(null)">Anuluj</button>
        <button
          mat-flat-button
          [disabled]="pending()"
          (click)="run('restore', true)"
        >
          Przywróć mimo to
        </button>
      } @else {
        <button
          mat-button
          class="remove"
          [disabled]="pending()"
          (click)="run('remove')"
        >
          <mat-icon>delete</mat-icon>
          Usuń
        </button>
        <span class="spacer"></span>
        @if (visit().state === 'SCHEDULED') {
          <button mat-button [disabled]="pending()" (click)="run('cancel')">
            Odwołaj
          </button>
          <button mat-button [disabled]="pending()" (click)="run('noShow')">
            Nie przyszedł
          </button>
        } @else {
          <button mat-button [disabled]="pending()" (click)="run('restore')">
            Przywróć
          </button>
        }
        <button mat-flat-button [disabled]="pending()" (click)="edit()">
          <mat-icon>edit</mat-icon>
          Edytuj
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .title {
      display: flex;
      align-items: center;
      padding-right: 12px;
    }
    .title h2 {
      flex: 1;
      overflow-wrap: anywhere;
    }
    h2 a {
      color: inherit;
    }
    .details {
      display: grid;
      gap: 12px;
      margin: 16px 0;
    }
    dt {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    dd {
      margin: 2px 0 0;
      overflow-wrap: anywhere;
    }
    dd a {
      color: var(--mat-sys-primary);
    }
    .state {
      font-weight: 600;
    }
    .state.cancelled,
    .state.no_show {
      color: var(--mat-sys-error);
    }
    .services {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .services li {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .price {
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
    .description {
      white-space: pre-line;
    }
    .history {
      margin: 16px 0;
    }
    mat-dialog-actions {
      flex-wrap: wrap;
    }
    .spacer {
      flex: 1;
    }
    .remove {
      color: var(--mat-sys-error);
    }
    .error {
      color: var(--mat-sys-error);
      margin: 8px 0 0;
    }
  `,
})
export class VisitCard {
  private readonly api = inject(VisitsService);
  private readonly changesApi = inject(VisitChangesService);
  private readonly dialog = inject(MatDialog);
  private readonly ref =
    inject<MatDialogRef<VisitCard, VisitCardResult>>(MatDialogRef);
  private readonly data = inject<VisitCardData>(MAT_DIALOG_DATA);

  protected readonly isOwner = inject(AuthService).me()?.role === 'OWNER';
  protected readonly formatPhone = formatPhone;

  protected readonly visit = signal(this.data.visit);
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  /** The Kolizje of "Przywróć", which then asks for "Przywróć mimo to". */
  protected readonly collisions = signal<VisitCollision[] | null>(null);

  /** "Klient usunięty" has no karta Klienta (it answers `404`). */
  protected readonly clientLink = computed(() =>
    this.visit().client.name === DELETED_CLIENT_NAME
      ? null
      : clientCardPath(this.visit().clientId),
  );

  protected readonly stateLabel = computed(() =>
    visitStateLabel(this.visit(), new Date()),
  );

  /** `12.11.2026, 10:00–11:15 (+10 min Przerwy)` */
  protected readonly when = computed(() => {
    const { startsAt, durationMin, breakMin } = this.visit();
    const end = new Date(
      new Date(startsAt).getTime() + durationMin * MINUTE_MS,
    );
    const time = `${formatWarsawDate(startsAt)}, ${warsawTime(startsAt)}–${warsawTime(end)}`;
    return breakMin ? `${time} (+${breakMin} min Przerwy)` : time;
  });

  protected readonly staffName = computed(() => {
    const person = this.data.staff.find(
      (p) => p.id === this.visit().staffMemberId,
    );
    if (!person) return '';
    return person.visibleUntil
      ? `${person.displayName} (usunięta)`
      : person.displayName;
  });

  protected readonly historyOpened = signal(false);
  /** Bumped after every change, so an opened Historia shows it. */
  private readonly version = signal(0);
  protected readonly history = resource({
    params: () =>
      this.historyOpened()
        ? { id: this.visit().id, version: this.version() }
        : undefined,
    loader: ({ params }) => this.changesApi.forVisit(params.id),
  });
  protected readonly historyError = computed(() =>
    errorMessage(this.history.error()),
  );

  protected price(service: CalendarVisit['services'][number]): string {
    return formatPrice(service.priceGrosze, service.priceType);
  }

  protected edit(): void {
    this.ref.close({ edit: this.visit() });
  }

  protected async run(action: Action, acceptCollisions = false): Promise<void> {
    if (this.pending()) return;
    if (action === 'remove' && !(await this.confirmRemove())) return;
    const id = this.visit().id;
    this.pending.set(true);
    this.error.set(null);
    try {
      if (action === 'remove') {
        await this.api.remove(id);
        this.ref.close();
        return;
      }
      this.apply(
        action === 'cancel'
          ? await this.api.cancel(id)
          : action === 'noShow'
            ? await this.api.noShow(id)
            : await this.api.restore(id, acceptCollisions),
      );
      this.collisions.set(null);
    } catch (error) {
      const list = action === 'restore' ? collisionsOf(error) : null;
      if (list) this.collisions.set(list);
      else this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private apply(saved: VisitView): void {
    this.visit.update((visit) => ({ ...visit, ...saved }));
    this.version.update((v) => v + 1);
  }

  private confirmRemove(): Promise<boolean | undefined> {
    return firstValueFrom(
      this.dialog
        .open<DeleteVisitDialog, void, boolean>(DeleteVisitDialog)
        .afterClosed(),
    );
  }
}

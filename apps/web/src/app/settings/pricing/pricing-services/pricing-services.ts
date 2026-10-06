import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { formatPrice, ServiceCategoryView, ServiceView } from '@bookit/shared';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../../shared/error-message';
import {
  ArchiveServiceDialog,
  ArchiveServiceDialogData,
} from '../archive-service-dialog/archive-service-dialog';
import {
  ServiceDialog,
  ServiceDialogData,
} from '../service-dialog/service-dialog';
import { ServicesService } from '../services.service';

/**
 * The Usługi of the Cennik, grouped in the Kategorie from the page. The Właściciel adds
 * and edits them in a dialog, hides them on the Wizytówka, archives them after a
 * confirmation and sets their order within a Kategoria by dragging.
 */
@Component({
  selector: 'app-pricing-services',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTooltipModule,
    NgTemplateOutlet,
  ],
  template: `
    <div class="header">
      <h2>Usługi</h2>
      <mat-slide-toggle
        data-filter="archived"
        [checked]="showArchived()"
        (change)="showArchived.set($event.checked)"
      >
        Pokaż zarchiwizowane
      </mat-slide-toggle>
    </div>

    @if (actionError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    @if (groups(); as groups) {
      @for (group of groups; track group.category.id) {
        <section
          class="category"
          [attr.data-category]="group.category.id"
          [attr.aria-label]="group.category.name"
        >
          <div class="category-header">
            <h3>{{ group.category.name }}</h3>
            <button
              mat-button
              [disabled]="busy()"
              (click)="add(group.category)"
              [attr.aria-label]="'Dodaj Usługę do: ' + group.category.name"
            >
              <mat-icon>add</mat-icon>
              Dodaj Usługę
            </button>
          </div>
          @if (group.empty) {
            <p class="empty">Nie ma jeszcze Usług w tej Kategorii.</p>
          }
          <ul
            class="list"
            cdkDropList
            [cdkDropListDisabled]="busy()"
            (cdkDropListDropped)="drop(group.category, $event)"
            [attr.aria-label]="'Usługi: ' + group.category.name"
          >
            @for (service of group.active; track service.id) {
              <li class="service" cdkDrag cdkDragLockAxis="y">
                <mat-icon
                  class="handle"
                  cdkDragHandle
                  matTooltip="Przeciągnij, aby zmienić kolejność"
                  aria-hidden="true"
                  >drag_indicator</mat-icon
                >
                <ng-container
                  [ngTemplateOutlet]="details"
                  [ngTemplateOutletContext]="{ $implicit: service }"
                />
                <div class="actions">
                  <button
                    mat-icon-button
                    [disabled]="busy()"
                    (click)="toggleHidden(service)"
                    [attr.aria-label]="
                      (service.hidden
                        ? 'Pokaż na Wizytówce: '
                        : 'Ukryj na Wizytówce: ') + service.name
                    "
                    [matTooltip]="
                      service.hidden
                        ? 'Pokaż na Wizytówce'
                        : 'Ukryj na Wizytówce'
                    "
                  >
                    <mat-icon>{{
                      service.hidden ? 'visibility_off' : 'visibility'
                    }}</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    [disabled]="busy()"
                    (click)="edit(service)"
                    [attr.aria-label]="'Edytuj: ' + service.name"
                    matTooltip="Edytuj"
                  >
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    [disabled]="busy()"
                    (click)="archive(service)"
                    [attr.aria-label]="'Archiwizuj: ' + service.name"
                    matTooltip="Archiwizuj"
                  >
                    <mat-icon>archive</mat-icon>
                  </button>
                </div>
              </li>
            }
          </ul>
          @if (group.archived.length > 0) {
            <ul
              class="list archived-list"
              [attr.aria-label]="'Zarchiwizowane: ' + group.category.name"
            >
              @for (service of group.archived; track service.id) {
                <li class="service archived">
                  <mat-icon class="handle" aria-hidden="true">archive</mat-icon>
                  <ng-container
                    [ngTemplateOutlet]="details"
                    [ngTemplateOutletContext]="{ $implicit: service }"
                  />
                  <div class="actions">
                    <button
                      mat-button
                      [disabled]="busy()"
                      (click)="unarchive(service)"
                      [attr.aria-label]="'Przywróć: ' + service.name"
                    >
                      Przywróć
                    </button>
                  </div>
                </li>
              }
            </ul>
          }
        </section>
      }
    } @else if (loadError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else {
      <mat-spinner diameter="32" aria-label="Wczytywanie Usług" />
    }

    <ng-template #details let-service>
      <div class="details">
        <span class="name">{{ service.name }}</span>
        <span class="meta">
          {{ price(service) }} · {{ time(service) }}
          @if (service.hidden) {
            · <span class="badge">Ukryta na Wizytówce</span>
          }
          @if (service.archived) {
            · <span class="badge">Zarchiwizowana</span>
          }
        </span>
      </div>
    </ng-template>
  `,
  styles: `
    .header,
    .category-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    h2 {
      margin: 0;
      font-size: 16px;
    }
    h3 {
      margin: 0;
      font-size: 15px;
    }
    .category {
      margin-top: 16px;
    }
    .category-header {
      margin-bottom: 8px;
    }
    .error {
      color: var(--mat-sys-error);
    }
    .empty {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
    }
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
      overflow: hidden;
    }
    .list:empty {
      display: none;
    }
    .archived-list {
      margin-top: 8px;
    }
    .service {
      display: flex;
      gap: 12px;
      align-items: center;
      min-height: 56px;
      padding: 4px 8px 4px 12px;
      background: var(--mat-sys-surface);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .service:last-child {
      border-bottom: 0;
    }
    .service.archived {
      color: var(--mat-sys-on-surface-variant);
    }
    .handle {
      flex: none;
      cursor: grab;
      color: var(--mat-sys-on-surface-variant);
    }
    .archived .handle {
      cursor: default;
    }
    .details {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .name {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .meta {
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }
    .badge {
      font-weight: 500;
    }
    .actions {
      display: flex;
      flex: none;
    }
    .cdk-drag-preview {
      box-shadow: var(--mat-sys-level3);
    }
    .cdk-drag-placeholder {
      opacity: 0.3;
    }
    .cdk-drag-animating,
    .list.cdk-drop-list-dragging .service:not(.cdk-drag-placeholder) {
      transition: transform 200ms ease;
    }
  `,
})
export class PricingServices implements OnInit {
  private readonly api = inject(ServicesService);
  private readonly dialog = inject(MatDialog);

  readonly categories = input.required<ServiceCategoryView[]>();

  /** In the API's order: by Kategoria, then within it. Archived ones too. */
  protected readonly services = signal<ServiceView[] | null>(null);
  protected readonly showArchived = signal(false);
  protected readonly loadError = signal<string | null>(null);
  /** A save, an archive or a reorder is in progress. */
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly groups = computed(() => {
    const services = this.services();
    if (!services) return null;
    const showArchived = this.showArchived();
    return this.categories().map((category) => {
      const own = services.filter((s) => s.categoryId === category.id);
      return {
        category,
        /** No Usługa at all, also when archived ones are filtered out. */
        empty: own.length === 0,
        active: own.filter((s) => !s.archived),
        archived: showArchived ? own.filter((s) => s.archived) : [],
      };
    });
  });

  async ngOnInit(): Promise<void> {
    try {
      this.services.set(await this.api.list({ includeArchived: true }));
    } catch (error) {
      this.loadError.set(errorMessage(error));
    }
  }

  protected price(service: ServiceView): string {
    return formatPrice(service.priceGrosze, service.priceType);
  }

  protected time(service: ServiceView): string {
    const duration = `${service.durationMin} min`;
    return service.breakMin > 0
      ? `${duration} + ${service.breakMin} min Przerwy`
      : duration;
  }

  protected async add(category: ServiceCategoryView): Promise<void> {
    const saved = await this.openDialog({
      categories: this.categories(),
      categoryId: category.id,
    });
    if (saved) this.moveToEnd(saved);
  }

  protected async edit(service: ServiceView): Promise<void> {
    const saved = await this.openDialog({
      categories: this.categories(),
      service,
    });
    if (!saved) return;
    if (saved.categoryId === service.categoryId) this.replace(saved);
    else this.moveToEnd(saved);
  }

  protected async toggleHidden(service: ServiceView): Promise<void> {
    await this.run(async () => {
      this.replace(
        await this.api.update(service.id, { hidden: !service.hidden }),
      );
    });
  }

  protected async archive(service: ServiceView): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ArchiveServiceDialog, ArchiveServiceDialogData, boolean>(
          ArchiveServiceDialog,
          { data: { name: service.name } },
        )
        .afterClosed(),
    );
    if (!confirmed) return;
    await this.run(async () => {
      this.replace(await this.api.archive(service.id));
    });
  }

  /** The API puts it back at the end of its Kategoria. */
  protected async unarchive(service: ServiceView): Promise<void> {
    await this.run(async () => {
      this.moveToEnd(await this.api.unarchive(service.id));
    });
  }

  /** Moves the row at once and saves; a failed save puts it back. */
  protected async drop(
    category: ServiceCategoryView,
    event: CdkDragDrop<unknown>,
  ): Promise<void> {
    const before = this.services();
    if (!before || event.previousIndex === event.currentIndex) return;
    const inCategory = (s: ServiceView) =>
      s.categoryId === category.id && !s.archived;
    const ordered = before.filter(inCategory);
    moveItemInArray(ordered, event.previousIndex, event.currentIndex);
    // Grouping keeps the array order, so the Kategoria's Usługi can go anywhere in it.
    this.services.set([...before.filter((s) => !inCategory(s)), ...ordered]);
    await this.run(async () => {
      try {
        await this.api.reorder(
          category.id,
          ordered.map((s) => s.id),
        );
      } catch (error) {
        this.services.set(before);
        throw error;
      }
    });
  }

  private openDialog(
    data: ServiceDialogData,
  ): Promise<ServiceView | undefined> {
    return firstValueFrom(
      this.dialog
        .open<ServiceDialog, ServiceDialogData, ServiceView>(ServiceDialog, {
          data,
          autoFocus: 'dialog',
        })
        .afterClosed(),
    );
  }

  private replace(saved: ServiceView): void {
    this.services.update(
      (list) => list?.map((s) => (s.id === saved.id ? saved : s)) ?? null,
    );
  }

  /** Last in its Kategoria, as the API puts a new, moved or restored Usługa. */
  private moveToEnd(saved: ServiceView): void {
    this.services.update((list) => [
      ...(list ?? []).filter((s) => s.id !== saved.id),
      saved,
    ]);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await action();
    } catch (error) {
      this.actionError.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

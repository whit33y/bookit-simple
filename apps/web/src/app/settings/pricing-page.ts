import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Component, inject, OnInit, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormGroupDirective,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  SERVICE_CATEGORY_NAME_MAX_LENGTH,
  ServiceCategoryView,
} from '@bookit/shared';
import { errorMessage } from '../shared/error-message';
import { ServiceCategoriesService } from './service-categories.service';

const nameForm = () =>
  new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(SERVICE_CATEGORY_NAME_MAX_LENGTH),
      ],
    }),
  });

/**
 * `/panel/ustawienia/cennik`: the Właściciel adds, renames and deletes Kategorie Usług
 * and sets their order by dragging. Usługi come to this screen in #17.
 */
@Component({
  selector: 'app-pricing-page',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    ReactiveFormsModule,
  ],
  template: `
    <h1>Cennik</h1>

    <section class="card" aria-labelledby="add-heading">
      <h2 id="add-heading">Kategorie Usług</h2>
      <form
        class="add"
        aria-label="Dodaj Kategorię"
        [formGroup]="addForm"
        #formDir="ngForm"
        (ngSubmit)="add(formDir)"
      >
        <mat-form-field appearance="outline">
          <mat-label>Nowa Kategoria</mat-label>
          <input
            matInput
            formControlName="name"
            aria-label="Nazwa nowej Kategorii"
            placeholder="np. Strzyżenie"
            autocomplete="off"
          />
          @if (addForm.controls.name.hasError('maxlength')) {
            <mat-error>{{ tooLong }}</mat-error>
          } @else if (addForm.controls.name.invalid) {
            <mat-error>Wpisz nazwę</mat-error>
          }
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="adding()">
          <mat-icon>add</mat-icon>
          Dodaj
        </button>
      </form>
    </section>

    @if (actionError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    @if (categories(); as categories) {
      @if (categories.length === 0) {
        <p class="empty">
          Nie ma jeszcze Kategorii. Dodaj pierwszą, np. „Strzyżenie” albo
          „Paznokcie”.
        </p>
      } @else {
        <ul
          class="list"
          cdkDropList
          [cdkDropListDisabled]="busy() || editingId() !== null"
          (cdkDropListDropped)="drop($event)"
          aria-label="Kategorie Usług"
        >
          @for (category of categories; track category.id) {
            <li class="row" cdkDrag cdkDragLockAxis="y">
              <mat-icon
                class="handle"
                cdkDragHandle
                matTooltip="Przeciągnij, aby zmienić kolejność"
                aria-hidden="true"
                >drag_indicator</mat-icon
              >
              @if (editingId() === category.id) {
                <form
                  class="rename"
                  aria-label="Zmień nazwę Kategorii"
                  [formGroup]="renameForm"
                  (ngSubmit)="saveName(category)"
                  (keydown.escape)="cancelEdit()"
                >
                  <mat-form-field
                    appearance="outline"
                    subscriptSizing="dynamic"
                  >
                    <input
                      matInput
                      formControlName="name"
                      aria-label="Nazwa Kategorii"
                      autocomplete="off"
                    />
                    @if (renameForm.controls.name.hasError('maxlength')) {
                      <mat-error>{{ tooLong }}</mat-error>
                    } @else if (renameForm.controls.name.invalid) {
                      <mat-error>Wpisz nazwę</mat-error>
                    }
                  </mat-form-field>
                  <button
                    mat-icon-button
                    type="submit"
                    [disabled]="busy()"
                    aria-label="Zapisz"
                    matTooltip="Zapisz"
                  >
                    <mat-icon>check</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    type="button"
                    (click)="cancelEdit()"
                    aria-label="Anuluj"
                    matTooltip="Anuluj"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                </form>
              } @else {
                <span class="name">{{ category.name }}</span>
                <div class="actions">
                  <button
                    mat-icon-button
                    [disabled]="busy()"
                    (click)="startEdit(category)"
                    [attr.aria-label]="'Zmień nazwę: ' + category.name"
                    matTooltip="Zmień nazwę"
                  >
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    [disabled]="busy()"
                    (click)="remove(category)"
                    [attr.aria-label]="'Usuń: ' + category.name"
                    matTooltip="Usuń"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              }
            </li>
          }
        </ul>
      }
    } @else if (loadError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else {
      <mat-spinner diameter="32" aria-label="Wczytywanie" />
    }
  `,
  styles: `
    h1 {
      margin: 0 0 16px;
    }
    .card {
      padding: 16px 20px;
      border-radius: 16px;
      background: var(--mat-sys-surface-container);
      margin-bottom: 16px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 16px;
    }
    .add {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0 12px;
      align-items: start;
    }
    .add button {
      height: 56px;
    }
    .error {
      color: var(--mat-sys-error);
    }
    .empty {
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
    .row {
      display: flex;
      gap: 12px;
      align-items: center;
      min-height: 48px;
      padding: 4px 8px 4px 12px;
      background: var(--mat-sys-surface);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .row:last-child {
      border-bottom: 0;
    }
    .handle {
      flex: none;
      cursor: grab;
      color: var(--mat-sys-on-surface-variant);
    }
    .name {
      flex: 1;
      min-width: 0;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
    }
    .rename {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      padding: 4px 0;
    }
    .rename mat-form-field {
      flex: 1;
      min-width: 0;
    }
    .cdk-drag-preview {
      box-shadow: var(--mat-sys-level3);
    }
    .cdk-drag-placeholder {
      opacity: 0.3;
    }
    .cdk-drag-animating,
    .list.cdk-drop-list-dragging .row:not(.cdk-drag-placeholder) {
      transition: transform 200ms ease;
    }
  `,
})
export class PricingPage implements OnInit {
  private readonly api = inject(ServiceCategoriesService);

  protected readonly tooLong = `Nazwa może mieć najwyżej ${SERVICE_CATEGORY_NAME_MAX_LENGTH} znaków`;
  protected readonly addForm = nameForm();
  protected readonly renameForm = nameForm();

  protected readonly categories = signal<ServiceCategoryView[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly adding = signal(false);
  /** A rename, a delete or a reorder is in progress. */
  protected readonly busy = signal(false);
  /** The Kategoria whose name is being changed. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.categories.set(await this.api.list());
    } catch (error) {
      this.loadError.set(errorMessage(error));
    }
  }

  protected async add(formDir: FormGroupDirective): Promise<void> {
    if (this.adding()) return;
    this.addForm.markAllAsTouched();
    if (this.addForm.invalid) return;
    this.adding.set(true);
    this.actionError.set(null);
    try {
      const category = await this.api.create({
        name: this.addForm.controls.name.value.trim(),
      });
      this.categories.update((list) => [...(list ?? []), category]);
      formDir.resetForm({ name: '' });
    } catch (error) {
      this.actionError.set(errorMessage(error));
    } finally {
      this.adding.set(false);
    }
  }

  protected startEdit(category: ServiceCategoryView): void {
    this.renameForm.reset({ name: category.name });
    this.editingId.set(category.id);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected async saveName(category: ServiceCategoryView): Promise<void> {
    this.renameForm.markAllAsTouched();
    if (this.renameForm.invalid) return;
    const name = this.renameForm.controls.name.value.trim();
    if (name === category.name) {
      this.cancelEdit();
      return;
    }
    await this.run(async () => {
      const saved = await this.api.rename(category.id, { name });
      this.replace(saved);
      this.cancelEdit();
    });
  }

  /** The API refuses a Kategoria with Usługi; its message is shown and the list stays. */
  protected async remove(category: ServiceCategoryView): Promise<void> {
    await this.run(async () => {
      await this.api.remove(category.id);
      this.categories.update(
        (list) => list?.filter((c) => c.id !== category.id) ?? null,
      );
    });
  }

  /** Moves the row at once and saves; a failed save puts it back. */
  protected async drop(event: CdkDragDrop<unknown>): Promise<void> {
    const before = this.categories();
    if (!before || event.previousIndex === event.currentIndex) return;
    const after = [...before];
    moveItemInArray(after, event.previousIndex, event.currentIndex);
    this.categories.set(after);
    await this.run(async () => {
      try {
        await this.api.reorder(after.map((c) => c.id));
      } catch (error) {
        this.categories.set(before);
        throw error;
      }
    });
  }

  private replace(saved: ServiceCategoryView): void {
    this.categories.update(
      (list) => list?.map((c) => (c.id === saved.id ? saved : c)) ?? null,
    );
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

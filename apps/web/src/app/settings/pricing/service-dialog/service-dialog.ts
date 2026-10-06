import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  CreateServiceRequest,
  isServiceBreak,
  isServiceDuration,
  parsePrice,
  PriceType,
  priceInput,
  SERVICE_BREAK_INVALID,
  SERVICE_BREAK_MAX,
  SERVICE_DESCRIPTION_MAX_LENGTH,
  SERVICE_DURATION_INVALID,
  SERVICE_DURATION_MAX,
  SERVICE_DURATION_MIN,
  SERVICE_MINUTES_STEP,
  SERVICE_NAME_MAX_LENGTH,
  SERVICE_NAME_REQUIRED,
  SERVICE_NAME_TOO_LONG,
  SERVICE_PRICE_INVALID,
  SERVICE_PRICE_MAX_GROSZE,
  ServiceCategoryView,
  ServiceView,
} from '@bookit/shared';
import { errorMessage } from '../../../shared/error-message';
import { ServicesService } from '../services.service';

export interface ServiceDialogData {
  categories: ServiceCategoryView[];
  /** The Usługa to edit; without it the dialog adds a new one. */
  service?: ServiceView;
  /** The Kategoria of a new Usługa. */
  categoryId?: string;
}

const DEFAULT_DURATION_MIN = 30;

const valid =
  (check: (value: number) => boolean, key: string) =>
  (control: AbstractControl<number | null>): ValidationErrors | null =>
    control.value !== null && check(control.value) ? null : { [key]: true };

function priceValidator(
  control: AbstractControl<string>,
): ValidationErrors | null {
  const grosze = parsePrice(control.value);
  return grosze !== null && grosze <= SERVICE_PRICE_MAX_GROSZE
    ? null
    : { price: true };
}

/**
 * Adds or edits one Usługa and saves it itself, so an error such as a taken name shows
 * in the dialog. The Cena is typed in złote with a comma. Closes with the saved Usługa.
 */
@Component({
  selector: 'app-service-dialog',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ data.service ? data.service.name : 'Nowa Usługa' }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <mat-form-field appearance="outline">
          <mat-label>Kategoria</mat-label>
          <mat-select formControlName="categoryId">
            @for (category of data.categories; track category.id) {
              <mat-option [value]="category.id">{{ category.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Nazwa</mat-label>
          <input matInput formControlName="name" autocomplete="off" />
          @if (form.controls.name.hasError('maxlength')) {
            <mat-error>{{ messages.nameTooLong }}</mat-error>
          } @else if (form.controls.name.invalid) {
            <mat-error>{{ messages.nameRequired }}</mat-error>
          }
        </mat-form-field>
        <div class="price">
          <mat-form-field appearance="outline">
            <mat-label>Cena</mat-label>
            <input
              matInput
              formControlName="price"
              inputmode="decimal"
              placeholder="np. 79,50"
              autocomplete="off"
            />
            <span matTextSuffix>zł</span>
            @if (form.controls.price.invalid) {
              <mat-error>{{ messages.price }}</mat-error>
            }
          </mat-form-field>
          <mat-button-toggle-group
            formControlName="priceType"
            aria-label="Rodzaj Ceny"
          >
            <mat-button-toggle value="FIXED">Stała</mat-button-toggle>
            <mat-button-toggle value="FROM">Od</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        @if (form.controls.priceType.value === 'FROM') {
          <p class="hint">Od czego zależy Cena, napisz w opisie.</p>
        }
        <div class="minutes">
          <mat-form-field appearance="outline">
            <mat-label>Czas trwania</mat-label>
            <input
              matInput
              type="number"
              formControlName="durationMin"
              [min]="durationMin"
              [max]="durationMax"
              [step]="step"
            />
            <span matTextSuffix>min</span>
            @if (form.controls.durationMin.invalid) {
              <mat-error>{{ messages.duration }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Przerwa po Wizycie</mat-label>
            <input
              matInput
              type="number"
              formControlName="breakMin"
              min="0"
              [max]="breakMax"
              [step]="step"
            />
            <span matTextSuffix>min</span>
            @if (form.controls.breakMin.invalid) {
              <mat-error>{{ messages.break }}</mat-error>
            }
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline">
          <mat-label>Opis</mat-label>
          <textarea
            matInput
            formControlName="description"
            rows="3"
            [maxlength]="descriptionMax"
          ></textarea>
          <mat-hint align="end"
            >{{ form.controls.description.value.length }} /
            {{ descriptionMax }}</mat-hint
          >
        </mat-form-field>
        <mat-slide-toggle formControlName="hidden">
          Ukryj na Wizytówce
        </mat-slide-toggle>
        <p class="hint toggle-hint">
          Ukrytą Usługę Personel nadal wybiera przy Wizycie.
        </p>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Anuluj</button>
        <button mat-flat-button type="submit" [disabled]="pending()">
          Zapisz
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      display: flex;
      flex-direction: column;
      min-width: min(460px, 80vw);
    }
    mat-form-field {
      width: 100%;
      margin-bottom: 12px;
    }
    .price,
    .minutes {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .price mat-button-toggle-group {
      flex: none;
      margin-top: 4px;
    }
    .hint {
      margin: -8px 0 16px;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    .toggle-hint {
      margin: 0 0 16px 52px;
    }
    .error {
      color: var(--mat-sys-error);
      margin: 8px 0 0;
    }
  `,
})
export class ServiceDialog {
  private readonly api = inject(ServicesService);
  private readonly ref =
    inject<MatDialogRef<ServiceDialog, ServiceView>>(MatDialogRef);
  protected readonly data = inject<ServiceDialogData>(MAT_DIALOG_DATA);

  protected readonly messages = {
    nameRequired: SERVICE_NAME_REQUIRED,
    nameTooLong: SERVICE_NAME_TOO_LONG,
    price: SERVICE_PRICE_INVALID,
    duration: SERVICE_DURATION_INVALID,
    break: SERVICE_BREAK_INVALID,
  };
  protected readonly descriptionMax = SERVICE_DESCRIPTION_MAX_LENGTH;
  protected readonly durationMin = SERVICE_DURATION_MIN;
  protected readonly durationMax = SERVICE_DURATION_MAX;
  protected readonly breakMax = SERVICE_BREAK_MAX;
  protected readonly step = SERVICE_MINUTES_STEP;

  private readonly service = this.data.service;

  protected readonly form = new FormGroup({
    categoryId: new FormControl(
      this.service?.categoryId ??
        this.data.categoryId ??
        this.data.categories[0]?.id ??
        '',
      { nonNullable: true, validators: Validators.required },
    ),
    name: new FormControl(this.service?.name ?? '', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(SERVICE_NAME_MAX_LENGTH),
      ],
    }),
    description: new FormControl(this.service?.description ?? '', {
      nonNullable: true,
    }),
    price: new FormControl(
      this.service ? priceInput(this.service.priceGrosze) : '',
      { nonNullable: true, validators: priceValidator },
    ),
    priceType: new FormControl<PriceType>(this.service?.priceType ?? 'FIXED', {
      nonNullable: true,
    }),
    durationMin: new FormControl<number | null>(
      this.service?.durationMin ?? DEFAULT_DURATION_MIN,
      valid(isServiceDuration, 'duration'),
    ),
    breakMin: new FormControl<number | null>(
      this.service?.breakMin ?? 0,
      valid(isServiceBreak, 'break'),
    ),
    hidden: new FormControl(this.service?.hidden ?? false, {
      nonNullable: true,
    }),
  });

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async save(): Promise<void> {
    if (this.pending()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const fields = this.form.getRawValue();
    const body: CreateServiceRequest = {
      categoryId: fields.categoryId,
      name: fields.name.trim(),
      description: fields.description.trim() || null,
      // The validators let only a Cena, a Czas trwania and a Przerwa through.
      priceGrosze: parsePrice(fields.price) as number,
      priceType: fields.priceType,
      durationMin: fields.durationMin as number,
      breakMin: fields.breakMin as number,
      hidden: fields.hidden,
    };
    this.pending.set(true);
    this.error.set(null);
    try {
      this.ref.close(
        this.service
          ? await this.api.update(this.service.id, body)
          : await this.api.create(body),
      );
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}

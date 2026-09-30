import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DOCUMENT, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import {
  addressLine,
  CreateSalonRequest,
  OWNER_EMAIL_TAKEN,
  parsePhone,
  PHONE_INVALID,
  POSTAL_CODE_INVALID,
  POSTAL_CODE_PATTERN,
  SLUG_ERROR_MESSAGES,
  SlugUnavailableReason,
  slugify,
} from '@bookit/shared';
import { filter, firstValueFrom, map, startWith } from 'rxjs';
import { errorMessage } from '../shared/error-message';
import { AdminSalonsService } from './admin-salons.service';
import { slugFormat, slugFree, slugReason } from './slug-validators';

/** What the Salons page shows after a Salon was created (router state). */
export interface SalonCreatedState {
  created: { name: string; ownerEmail: string };
}

const phone: ValidatorFn = (control) => {
  const value = (control.value as string).trim();
  return value && !parsePhone(value) ? { phone: true } : null;
};

/** A text field that resets to `''`, never `null`. */
const textControl = (...validators: ValidatorFn[]) =>
  new FormControl('', { nonNullable: true, validators });

/** `/admin/salony/nowy`: the Administrator creates a Salon and invites its Właściciel. */
@Component({
  selector: 'app-new-salon-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './new-salon-page.html',
  styleUrl: './new-salon-page.scss',
})
export class NewSalonPage {
  private readonly api = inject(AdminSalonsService);
  private readonly router = inject(Router);

  /** Where Wizytówki live, e.g. `http://localhost:4200`. */
  protected readonly origin = inject(DOCUMENT).location.origin;
  protected readonly messages = SLUG_ERROR_MESSAGES;
  protected readonly phoneInvalid = PHONE_INVALID;
  protected readonly postalCodeInvalid = POSTAL_CODE_INVALID;
  protected readonly ownerEmailTaken = OWNER_EMAIL_TAKEN;

  protected readonly form = new FormGroup({
    name: textControl(Validators.required),
    slug: new FormControl('', {
      nonNullable: true,
      validators: slugFormat,
      asyncValidators: slugFree(this.api),
    }),
    phone: textControl(phone),
    email: textControl(Validators.email),
    street: textControl(),
    postalCode: textControl(Validators.pattern(POSTAL_CODE_PATTERN)),
    city: textControl(),
    ownerName: textControl(Validators.required),
    ownerEmail: textControl(Validators.required, Validators.email),
  });

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );
  private readonly slugStatus = toSignal(
    this.form.controls.slug.statusChanges.pipe(
      startWith(this.form.controls.slug.status),
    ),
    { requireSync: true },
  );

  /** Until the Administrator types an address, it follows the name. */
  private slugEdited = false;

  protected readonly url = computed(
    () => `${this.origin}/${this.value().slug}`,
  );
  /** Why the address cannot be used, or its check state. */
  protected readonly slugState = computed(
    (): 'empty' | 'checking' | 'free' | SlugUnavailableReason => {
      const status = this.slugStatus();
      if (!this.value().slug) return 'empty';
      if (status === 'PENDING') return 'checking';
      if (status === 'VALID') return 'free';
      return this.slugReason();
    },
  );
  protected readonly address = computed(() => addressLine(this.value()));
  protected readonly phonePreview = computed(() => {
    const raw = this.value().phone.trim();
    return raw ? (parsePhone(raw)?.international ?? null) : '';
  });

  constructor() {
    this.form.controls.name.valueChanges.subscribe((name) => {
      if (this.slugEdited) return;
      const slug = this.form.controls.slug;
      slug.setValue(slugify(name));
      if (slug.value) slug.markAsTouched();
    });
  }

  /** Typing in the address field stops the suggestion; clearing it brings it back. */
  protected slugTyped(): void {
    this.slugEdited = this.form.controls.slug.value !== '';
  }

  protected slugReason(): SlugUnavailableReason {
    return slugReason(this.form.controls.slug);
  }

  protected async submit(): Promise<void> {
    if (this.pending()) return;
    this.form.markAllAsTouched();
    this.pending.set(true);
    this.error.set(null);
    try {
      // A click right after editing the address waits for its check.
      if (this.form.pending) {
        await firstValueFrom(
          this.form.statusChanges.pipe(filter((s) => s !== 'PENDING')),
        );
      }
      if (this.form.invalid) return;
      const fields = this.form.getRawValue();
      const body: CreateSalonRequest = {
        name: fields.name.trim(),
        slug: fields.slug,
        ownerName: fields.ownerName.trim(),
        ownerEmail: fields.ownerEmail.trim(),
        phone: fields.phone.trim() || null,
        email: fields.email.trim() || null,
        street: fields.street.trim() || null,
        postalCode: fields.postalCode.trim() || null,
        city: fields.city.trim() || null,
      };
      await this.api.create(body);
      const state: SalonCreatedState = {
        created: { name: body.name, ownerEmail: body.ownerEmail },
      };
      await this.router.navigateByUrl('/admin', { state });
    } catch (error) {
      this.showError(error);
    } finally {
      this.pending.set(false);
    }
  }

  /** A `409` points at its field; anything else goes under the form. */
  private showError(error: unknown): void {
    const message = errorMessage(error);
    if (error instanceof HttpErrorResponse && error.status === 409) {
      if (message === SLUG_ERROR_MESSAGES.TAKEN) {
        this.form.controls.slug.setErrors({ slug: 'TAKEN' });
        return;
      }
      if (message === OWNER_EMAIL_TAKEN) {
        this.form.controls.ownerEmail.setErrors({ taken: true });
        return;
      }
    }
    this.error.set(message);
  }
}

import {
  AbstractControl,
  AsyncValidatorFn,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { SlugUnavailableReason, validateSlug } from '@bookit/shared';
import { catchError, map, of, switchMap, timer } from 'rxjs';
import { AdminSalonsService } from './admin-salons.service';

/** Pause after the last keystroke before asking the API whether the address is free. */
export const SLUG_CHECK_DEBOUNCE_MS = 300;

/** `{ slug: reason }` for an address in the wrong form. */
export const slugFormat: ValidatorFn = (control) => {
  const reason = validateSlug(control.value as string);
  return reason ? { slug: reason } : null;
};

/**
 * `{ slug: 'TAKEN' }`; a failed check lets the API decide on submit. With `salonId`,
 * that Salon's own addresses are free, and `current()` is not checked at all.
 */
export function slugFree(
  api: AdminSalonsService,
  salon?: { id: () => string; current: () => string | undefined },
): AsyncValidatorFn {
  return (control: AbstractControl) => {
    const slug = control.value as string;
    if (salon && slug === salon.current()) return of(null);
    // A new value unsubscribes the previous check, so the timer is the debounce.
    return timer(SLUG_CHECK_DEBOUNCE_MS).pipe(
      switchMap(() => api.slugAvailability(slug, salon?.id())),
      map((res): ValidationErrors | null =>
        res.available ? null : { slug: res.reason },
      ),
      catchError(() => of(null)),
    );
  };
}

/** Why the address in `control` cannot be used, for its error message. */
export function slugReason(control: AbstractControl): SlugUnavailableReason {
  const reason = control.errors?.['slug'] as SlugUnavailableReason | undefined;
  return reason ?? 'INVALID';
}

import { Component, input } from '@angular/core';
import { SalonStatus } from '@bookit/shared';

/** "Aktywny" or "Zawieszony" as a small badge. */
@Component({
  selector: 'app-salon-status',
  template: `
    <span class="badge" [class.suspended]="status() === 'SUSPENDED'">
      {{ status() === 'SUSPENDED' ? 'Zawieszony' : 'Aktywny' }}
    </span>
  `,
  styles: `
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .suspended {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
  `,
})
export class SalonStatusBadge {
  readonly status = input.required<SalonStatus>();
}

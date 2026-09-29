import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
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

/** Whether the Właściciel has accepted the invitation: "Przyjęte" or "Oczekuje". */
@Component({
  selector: 'app-invitation-status',
  imports: [MatIconModule],
  template: `
    @if (accepted()) {
      <span class="invite"><mat-icon>check_circle</mat-icon>Przyjęte</span>
    } @else {
      <span class="invite pending"
        ><mat-icon>schedule</mat-icon>Oczekuje</span
      >
    }
  `,
  styles: `
    .invite {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      color: var(--mat-sys-on-surface-variant);
    }
    mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .pending {
      color: var(--mat-sys-tertiary);
    }
  `,
})
export class InvitationStatusBadge {
  readonly accepted = input.required<boolean>();
}

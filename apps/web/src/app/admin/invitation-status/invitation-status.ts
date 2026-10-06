import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Whether the Właściciel has accepted the invitation: "Przyjęte" or "Oczekuje". */
@Component({
  selector: 'app-invitation-status',
  imports: [MatIconModule],
  template: `
    @if (accepted()) {
      <span class="invite"><mat-icon>check_circle</mat-icon>Przyjęte</span>
    } @else {
      <span class="invite pending"><mat-icon>schedule</mat-icon>Oczekuje</span>
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

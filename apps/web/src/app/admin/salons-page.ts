import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { SalonCreatedState } from './new-salon-page';

/** `/admin`: the Salons. The list and search come in #12. */
@Component({
  selector: 'app-salons-page',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  template: `
    <div class="head">
      <h1>Salony</h1>
      <a mat-flat-button routerLink="/admin/salony/nowy">
        <mat-icon>add</mat-icon>
        Nowy Salon
      </a>
    </div>
    @if (created; as created) {
      <p class="info" role="status">
        Salon {{ created.name }} został założony. Zaproszenie poszło na
        {{ created.ownerEmail }}.
      </p>
    }
    <p class="soon">Lista Salonów jest w przygotowaniu.</p>
  `,
  styles: `
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .info {
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .soon {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class SalonsPage {
  private readonly location = inject(Location);

  /** Set by the new-Salon form when it navigates here. */
  protected readonly created = (
    this.location.getState() as Partial<SalonCreatedState> | null
  )?.created;

  constructor() {
    // Shown once: a reload of /admin should not announce the Salon again.
    if (this.created) this.location.replaceState(this.location.path());
  }
}

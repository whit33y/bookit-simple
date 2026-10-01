import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';

/**
 * Asks before removing a Wizyta for good; closes with `true` to remove. Removing is for
 * a Wizyta entered by mistake: one the Klient called off is "Odwołaj".
 */
@Component({
  selector: 'app-delete-visit-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Usunąć Wizytę?</h2>
    <mat-dialog-content>
      <p>
        Usuń tylko Wizytę wpisaną przez pomyłkę. Usunięta znika z kalendarza i z
        historii Klienta.
      </p>
      <p>
        Jeśli Klient odwołał albo nie przyszedł, użyj „Odwołaj” albo „Nie
        przyszedł”, a Wizyta zostanie w jego historii.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Anuluj</button>
      <button mat-flat-button class="danger" [mat-dialog-close]="true">
        Usuń Wizytę
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .danger {
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
    }
  `,
})
export class DeleteVisitDialog {}

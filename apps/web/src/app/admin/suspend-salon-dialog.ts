import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface SuspendSalonDialogData {
  name: string;
}

/** Asks before suspending; closes with `true` to go ahead. */
@Component({
  selector: 'app-suspend-salon-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Zawiesić Salon {{ data.name }}?</h2>
    <mat-dialog-content>
      <ul>
        <li>Personel zostanie wylogowany i nie zaloguje się do panelu.</li>
        <li>Wizytówka przestanie być widoczna dla Klientów.</li>
        <li>Dane Salonu zostają. Odwieszenie przywraca logowanie.</li>
      </ul>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Anuluj</button>
      <button mat-flat-button class="danger" [mat-dialog-close]="true">
        Zawieś Salon
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    ul {
      margin: 0;
      padding-left: 20px;
      line-height: 1.6;
    }
    .danger {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class SuspendSalonDialog {
  protected readonly data = inject<SuspendSalonDialogData>(MAT_DIALOG_DATA);
}

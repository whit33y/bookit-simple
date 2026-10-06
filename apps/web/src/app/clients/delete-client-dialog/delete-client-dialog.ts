import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { DELETED_CLIENT_NAME } from '@bookit/shared';

export interface DeleteClientDialogData {
  name: string;
}

/** Asks before deleting a Klient (an RODO request); closes with `true` to go ahead. */
@Component({
  selector: 'app-delete-client-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Usunąć Klienta {{ data.name }}?</h2>
    <mat-dialog-content>
      <p>
        Imię, telefon i uwagi zostaną usunięte. Przeszłe Wizyty zostaną w
        kalendarzu jako „{{ deletedName }}”, a zaplanowane Wizyty od teraz
        zostaną usunięte.
      </p>
      <p>Tego nie da się cofnąć.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Anuluj</button>
      <button mat-flat-button [mat-dialog-close]="true">Usuń</button>
    </mat-dialog-actions>
  `,
})
export class DeleteClientDialog {
  protected readonly data = inject<DeleteClientDialogData>(MAT_DIALOG_DATA);
  protected readonly deletedName = DELETED_CLIENT_NAME;
}

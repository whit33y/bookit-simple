import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface ArchiveServiceDialogData {
  name: string;
}

/** Asks before archiving a Usługa; closes with `true` to go ahead. */
@Component({
  selector: 'app-archive-service-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Zarchiwizować Usługę {{ data.name }}?</h2>
    <mat-dialog-content>
      <ul>
        <li>Zniknie z Cennika na Wizytówce i z wyboru Usług przy Wizycie.</li>
        <li>Wizyty, które już ją mają, nadal ją pokazują.</li>
        <li>Przywrócisz ją po włączeniu „Pokaż zarchiwizowane”.</li>
      </ul>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Anuluj</button>
      <button mat-flat-button [mat-dialog-close]="true">Archiwizuj</button>
    </mat-dialog-actions>
  `,
  styles: `
    ul {
      margin: 0;
      padding-left: 20px;
      line-height: 1.6;
    }
  `,
})
export class ArchiveServiceDialog {
  protected readonly data = inject<ArchiveServiceDialogData>(MAT_DIALOG_DATA);
}

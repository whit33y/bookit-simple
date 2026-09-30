import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface DeleteAnnouncementDialogData {
  title: string;
}

/** Asks before deleting an Ogłoszenie; closes with `true` to go ahead. */
@Component({
  selector: 'app-delete-announcement-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Usunąć Ogłoszenie {{ data.title }}?</h2>
    <mat-dialog-content>
      Zniknie z Wizytówki i z listy, także z minionych. Tego nie da się cofnąć.
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Anuluj</button>
      <button mat-flat-button [mat-dialog-close]="true">Usuń</button>
    </mat-dialog-actions>
  `,
})
export class DeleteAnnouncementDialog {
  protected readonly data =
    inject<DeleteAnnouncementDialogData>(MAT_DIALOG_DATA);
}

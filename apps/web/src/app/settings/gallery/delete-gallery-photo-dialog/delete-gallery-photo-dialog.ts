import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface DeleteGalleryPhotoDialogData {
  url: string;
}

/** Asks before deleting a photo of the gallery; closes with `true` to go ahead. */
@Component({
  selector: 'app-delete-gallery-photo-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Usunąć zdjęcie z galerii?</h2>
    <mat-dialog-content>
      <img [src]="data.url" alt="Zdjęcie do usunięcia" />
      <p>Zniknie z Wizytówki. Tego nie da się cofnąć.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Anuluj</button>
      <button mat-flat-button [mat-dialog-close]="true">Usuń</button>
    </mat-dialog-actions>
  `,
  styles: `
    img {
      display: block;
      width: 160px;
      height: 160px;
      object-fit: cover;
      border-radius: 8px;
    }
    p {
      margin: 12px 0 0;
    }
  `,
})
export class DeleteGalleryPhotoDialog {
  protected readonly data =
    inject<DeleteGalleryPhotoDialogData>(MAT_DIALOG_DATA);
}

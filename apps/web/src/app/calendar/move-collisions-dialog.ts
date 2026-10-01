import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { VisitCollision } from '@bookit/shared';
import { VisitCollisions } from './visit-collisions';

/**
 * The Kolizje of a Wizyta dragged onto taken time; closes with `true` for "Zapisz mimo
 * to", anything else puts it back.
 */
@Component({
  selector: 'app-move-collisions-dialog',
  imports: [MatButtonModule, MatDialogModule, VisitCollisions],
  template: `
    <h2 mat-dialog-title>Kolizja</h2>
    <mat-dialog-content>
      <app-visit-collisions [collisions]="collisions" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cofnij</button>
      <button mat-flat-button [mat-dialog-close]="true">Zapisz mimo to</button>
    </mat-dialog-actions>
  `,
})
export class MoveCollisionsDialog {
  protected readonly collisions = inject<VisitCollision[]>(MAT_DIALOG_DATA);
}

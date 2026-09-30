import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { StaffDeletionPreview, StaffMemberView } from '@bookit/shared';
import { errorMessage } from '../shared/error-message';
import { StaffService } from './staff.service';

/**
 * Removes a person from the Personel after showing her Wizyty and asking whether they
 * stay. Deletes itself, so an error shows in the dialog; closes with `true` once done.
 */
@Component({
  selector: 'app-delete-staff-dialog',
  imports: [
    DatePipe,
    MatButtonModule,
    MatDialogModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>Usunąć z Personelu: {{ member.displayName }}?</h2>
    <mat-dialog-content>
      <p>
        Konto, zdjęcie i opis zostaną usunięte, a {{ member.displayName }} nie
        zaloguje się już do panelu. Tego nie da się cofnąć.
      </p>
      @if (preview(); as preview) {
        @if (hasVisits()) {
          <ul>
            <li>Przeszłe Wizyty: {{ preview.pastVisits }}</li>
            <li>Przyszłe Wizyty: {{ preview.futureVisits }}</li>
            @if (preview.lastScheduledVisitAt; as last) {
              <li>
                Ostatnia zaplanowana Wizyta:
                {{ last | date: 'd.MM.yyyy' : 'Europe/Warsaw' }}
              </li>
            }
          </ul>
          <p>
            <strong>Zachować Wizyty?</strong> Zachowane zostaną w kalendarzu i
            historii Klientów z imieniem {{ member.displayName }} i można je
            przepisać na inną osobę. Usunięte znikną razem z Nieobecnościami.
          </p>
        } @else {
          <p>{{ member.displayName }} nie ma żadnych Wizyt.</p>
        }
      } @else if (!error()) {
        <mat-spinner diameter="32" aria-label="Wczytywanie" />
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Anuluj</button>
      @if (preview()) {
        @if (hasVisits()) {
          <button mat-button [disabled]="pending()" (click)="remove(false)">
            Usuń Wizyty
          </button>
          <button mat-flat-button [disabled]="pending()" (click)="remove(true)">
            Zachowaj Wizyty
          </button>
        } @else {
          <!-- Nothing to keep, so her Nieobecności go too. -->
          <button
            mat-flat-button
            [disabled]="pending()"
            (click)="remove(false)"
          >
            Usuń
          </button>
        }
      }
    </mat-dialog-actions>
  `,
  styles: `
    ul {
      padding-left: 20px;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class DeleteStaffDialog implements OnInit {
  private readonly api = inject(StaffService);
  private readonly ref =
    inject<MatDialogRef<DeleteStaffDialog, boolean>>(MatDialogRef);
  protected readonly member = inject<StaffMemberView>(MAT_DIALOG_DATA);

  protected readonly preview = signal<StaffDeletionPreview | null>(null);
  protected readonly hasVisits = computed(() => {
    const preview = this.preview();
    return !!preview && preview.pastVisits + preview.futureVisits > 0;
  });
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.preview.set(await this.api.deletionPreview(this.member.id));
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  protected async remove(keepVisits: boolean): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    this.error.set(null);
    try {
      await this.api.remove(this.member.id, keepVisits);
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}

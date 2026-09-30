import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormGroupDirective,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import {
  InvitationStatus,
  STAFF_EMAIL_TAKEN,
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  StaffMemberView,
  StaffRole,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { errorMessage } from '../shared/error-message';
import { EditStaffDialog } from './edit-staff-dialog';
import { StaffService } from './staff.service';

const INVITATION_LABELS: Record<InvitationStatus, string> = {
  ACCEPTED: 'Przyjęte',
  PENDING: 'Oczekuje',
  EXPIRED: 'Wygasło',
};

/**
 * `/panel/ustawienia/personel`: the Właściciel invites people, edits them in a dialog
 * and sets their order by dragging.
 */
@Component({
  selector: 'app-staff-page',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    ReactiveFormsModule,
  ],
  template: `
    <h1>Personel</h1>

    <section class="card" aria-labelledby="invite-heading">
      <h2 id="invite-heading">Zaproś osobę</h2>
      <form
        class="invite"
        [formGroup]="form"
        #formDir="ngForm"
        (ngSubmit)="invite(formDir)"
      >
        <mat-form-field appearance="outline">
          <mat-label>Imię</mat-label>
          <input matInput formControlName="displayName" autocomplete="off" />
          @if (form.controls.displayName.hasError('required')) {
            <mat-error>Wpisz imię</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>E-mail</mat-label>
          <input
            matInput
            type="email"
            formControlName="email"
            autocomplete="off"
          />
          @if (form.controls.email.hasError('required')) {
            <mat-error>Wpisz e-mail</mat-error>
          } @else if (form.controls.email.hasError('email')) {
            <mat-error>Nieprawidłowy e-mail</mat-error>
          } @else if (form.controls.email.hasError('taken')) {
            <mat-error>{{ emailTaken }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Rola</mat-label>
          <mat-select formControlName="role">
            @for (role of roles; track role) {
              <mat-option [value]="role">{{ roleLabels[role] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="inviting()">
          <mat-icon>send</mat-icon>
          Zaproś
        </button>
      </form>
      <p class="fine">
        Wyślemy e-mail z linkiem do ustawienia hasła, ważnym 7 dni.
      </p>
    </section>

    @if (notice(); as notice) {
      <p class="info" role="status">{{ notice }}</p>
    }
    @if (actionError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    @if (staff(); as staff) {
      <ul
        class="list"
        cdkDropList
        [cdkDropListDisabled]="busy()"
        (cdkDropListDropped)="drop($event)"
        aria-label="Personel"
      >
        @for (member of staff; track member.id) {
          <li class="row" cdkDrag cdkDragLockAxis="y">
            <mat-icon
              class="handle"
              cdkDragHandle
              matTooltip="Przeciągnij, aby zmienić kolejność"
              aria-hidden="true"
              >drag_indicator</mat-icon
            >
            <div class="who">
              <span class="name">{{ member.displayName }}</span>
              <span class="email">{{ member.email }}</span>
            </div>
            <div class="tags">
              <span class="tag role">{{ roleLabels[member.role] }}</span>
              <span class="tag invitation" [class]="member.invitation">
                {{ invitationLabels[member.invitation] }}
              </span>
              @if (member.acceptsVisits) {
                <span class="tag">Przyjmuje Wizyty</span>
              }
              @if (member.showOnPage) {
                <span class="tag">Na Wizytówce</span>
              }
            </div>
            <div class="actions">
              @if (member.invitation !== 'ACCEPTED') {
                <button
                  mat-icon-button
                  [disabled]="busy()"
                  (click)="resend(member)"
                  [attr.aria-label]="
                    'Wyślij zaproszenie ponownie: ' + member.displayName
                  "
                  matTooltip="Wyślij zaproszenie ponownie"
                >
                  <mat-icon>forward_to_inbox</mat-icon>
                </button>
              }
              <button
                mat-icon-button
                (click)="edit(member)"
                [attr.aria-label]="'Edytuj: ' + member.displayName"
                matTooltip="Edytuj"
              >
                <mat-icon>edit</mat-icon>
              </button>
            </div>
          </li>
        }
      </ul>
    } @else if (loadError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else {
      <mat-spinner diameter="32" aria-label="Wczytywanie" />
    }
  `,
  styles: `
    h1 {
      margin: 0 0 16px;
    }
    .card {
      padding: 16px 20px;
      border-radius: 16px;
      background: var(--mat-sys-surface-container);
      margin-bottom: 16px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 16px;
    }
    .invite {
      display: grid;
      gap: 0 12px;
      align-items: start;
    }
    .invite button {
      height: 56px;
    }
    .fine {
      margin: 0;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    .info {
      color: var(--mat-sys-primary);
    }
    .error {
      color: var(--mat-sys-error);
    }
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
      overflow: hidden;
    }
    .row {
      display: grid;
      grid-template: 'handle who actions' auto 'handle tags actions' auto / auto 1fr auto;
      gap: 4px 12px;
      align-items: center;
      padding: 12px 8px 12px 12px;
      background: var(--mat-sys-surface);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .row:last-child {
      border-bottom: 0;
    }
    .handle {
      grid-area: handle;
      cursor: grab;
      color: var(--mat-sys-on-surface-variant);
    }
    .who {
      grid-area: who;
      display: flex;
      flex-wrap: wrap;
      gap: 0 8px;
      min-width: 0;
    }
    .name {
      font-weight: 600;
    }
    .email {
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }
    .tags {
      grid-area: tags;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .tag {
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 12px;
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface-variant);
    }
    .role {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      font-weight: 600;
    }
    .PENDING {
      color: var(--mat-sys-tertiary);
    }
    .EXPIRED {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .actions {
      grid-area: actions;
      display: flex;
    }
    .cdk-drag-preview {
      box-shadow: var(--mat-sys-level3);
    }
    .cdk-drag-placeholder {
      opacity: 0.3;
    }
    .cdk-drag-animating,
    .list.cdk-drop-list-dragging .row:not(.cdk-drag-placeholder) {
      transition: transform 200ms ease;
    }
    @media (min-width: 768px) {
      .invite {
        grid-template-columns: 1fr 1fr 180px auto;
      }
    }
  `,
})
export class StaffPage implements OnInit {
  private readonly api = inject(StaffService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  protected readonly roles = STAFF_ROLES;
  protected readonly roleLabels = STAFF_ROLE_LABELS;
  protected readonly invitationLabels = INVITATION_LABELS;
  protected readonly emailTaken = STAFF_EMAIL_TAKEN;

  protected readonly form = new FormGroup({
    displayName: new FormControl('', {
      nonNullable: true,
      validators: Validators.required,
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    role: new FormControl<StaffRole>('EMPLOYEE', { nonNullable: true }),
  });

  protected readonly staff = signal<StaffMemberView[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly inviting = signal(false);
  /** A resend or a reorder is in progress. */
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.staff.set(await this.api.list());
    } catch (error) {
      this.loadError.set(errorMessage(error));
    }
  }

  protected async invite(formDir: FormGroupDirective): Promise<void> {
    if (this.inviting()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const fields = this.form.getRawValue();
    this.inviting.set(true);
    this.clearMessages();
    try {
      const member = await this.api.invite({
        displayName: fields.displayName.trim(),
        email: fields.email.trim(),
        role: fields.role,
      });
      this.staff.update((staff) => [...(staff ?? []), member]);
      formDir.resetForm({ displayName: '', email: '', role: 'EMPLOYEE' });
      this.notice.set(`Zaproszenie poszło na ${member.email}.`);
    } catch (error) {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 409 &&
        errorMessage(error) === STAFF_EMAIL_TAKEN
      ) {
        this.form.controls.email.setErrors({ taken: true });
      } else {
        this.actionError.set(errorMessage(error));
      }
    } finally {
      this.inviting.set(false);
    }
  }

  protected async resend(member: StaffMemberView): Promise<void> {
    await this.run(async () => {
      await this.api.resendInvitation(member.id);
      this.staff.update(
        (staff) =>
          staff?.map((m) =>
            m.id === member.id ? { ...m, invitation: 'PENDING' } : m,
          ) ?? null,
      );
      this.notice.set(
        `Nowe zaproszenie poszło na ${member.email}. Poprzedni link przestał działać.`,
      );
    });
  }

  /** Moves the row at once and saves; a failed save puts it back. */
  protected async drop(event: CdkDragDrop<unknown>): Promise<void> {
    const before = this.staff();
    if (!before || event.previousIndex === event.currentIndex) return;
    const after = [...before];
    moveItemInArray(after, event.previousIndex, event.currentIndex);
    this.staff.set(after);
    await this.run(async () => {
      try {
        await this.api.reorder(after.map((m) => m.id));
      } catch (error) {
        this.staff.set(before);
        throw error;
      }
    });
  }

  protected async edit(member: StaffMemberView): Promise<void> {
    const saved = await firstValueFrom(
      this.dialog
        .open<EditStaffDialog, StaffMemberView, StaffMemberView>(
          EditStaffDialog,
          { data: member, autoFocus: 'dialog' },
        )
        .afterClosed(),
    );
    if (!saved) return;
    this.staff.update(
      (staff) => staff?.map((m) => (m.id === saved.id ? saved : m)) ?? null,
    );
    // A Właściciel who gave up the role no longer has the settings.
    if (
      saved.id === this.auth.me()?.staffMember?.id &&
      saved.role !== 'OWNER'
    ) {
      await this.auth.refresh();
      await this.router.navigateByUrl('/panel');
    }
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.clearMessages();
    try {
      await action();
    } catch (error) {
      this.actionError.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private clearMessages(): void {
    this.notice.set(null);
    this.actionError.set(null);
  }
}

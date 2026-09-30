import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  DOCUMENT,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import {
  addressLine,
  AdminSalonDetails,
  parsePhone,
  SLUG_ERROR_MESSAGES,
  SlugUnavailableReason,
} from '@bookit/shared';
import { firstValueFrom, startWith } from 'rxjs';
import { errorMessage } from '../shared/error-message';
import { AdminSalonsService } from './admin-salons.service';
import { InvitationStatusBadge, SalonStatusBadge } from './salon-status';
import {
  SuspendSalonDialog,
  SuspendSalonDialogData,
} from './suspend-salon-dialog';
import { slugFormat, slugFree, slugReason } from './slug-validators';

/** `/admin/salony/:id`: the Salon, its Właściciel, its Adres wizytówki, and suspending it. */
@Component({
  selector: 'app-salon-details-page',
  imports: [
    DatePipe,
    InvitationStatusBadge,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    RouterLink,
    SalonStatusBadge,
  ],
  template: `
    <a class="back" mat-button routerLink="/admin">
      <mat-icon>arrow_back</mat-icon>
      Salony
    </a>
    @if (salon(); as salon) {
      <h1>{{ salon.name }}</h1>
      <p class="muted url">{{ pageUrl() }}</p>
      @if (notice(); as notice) {
        <p class="info" role="status">{{ notice }}</p>
      }
      @if (actionError(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="layout">
        <div class="cards">
          <section class="card" aria-labelledby="owner-heading">
            <h2 id="owner-heading"><mat-icon>person</mat-icon>Właściciel</h2>
            @if (salon.owner; as owner) {
              <dl>
                <dt>Imię</dt>
                <dd>{{ owner.displayName }}</dd>
                <dt>E-mail</dt>
                <dd>{{ owner.email }}</dd>
                <dt>Zaproszenie</dt>
                <dd>
                  <app-invitation-status
                    [accepted]="owner.invitationAccepted"
                  />
                </dd>
              </dl>
            } @else {
              <p class="muted">Salon nie ma Właściciela.</p>
            }
          </section>
          <section class="card" aria-labelledby="slug-heading">
            <h2 id="slug-heading"><mat-icon>link</mat-icon>Adres wizytówki</h2>
            <form class="slug" (submit)="changeSlug($event)">
              <mat-form-field appearance="outline">
                <mat-label>Adres wizytówki</mat-label>
                <span matTextPrefix>{{ origin }}/</span>
                <input
                  matInput
                  name="slug"
                  [formControl]="slug"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  (input)="slug.markAsTouched()"
                />
                @if (slugStatus() === 'INVALID') {
                  <mat-error>{{ messages[slugReason()] }}</mat-error>
                } @else if (slugStatus() === 'PENDING') {
                  <mat-hint>Sprawdzam, czy adres jest wolny…</mat-hint>
                }
              </mat-form-field>
              @if (slugChanged()) {
                <p class="warning" role="note">
                  <mat-icon>warning</mat-icon>
                  <span>
                    Linki do {{ pageUrl() }} będą przekierowywane na nowy adres,
                    także te z ulotek i z Google. Inny Salon nie dostanie
                    starego adresu.
                  </span>
                </p>
              }
              <button
                mat-flat-button
                type="submit"
                [disabled]="
                  busy() || !slugChanged() || slugStatus() !== 'VALID'
                "
              >
                Zmień adres
              </button>
            </form>
          </section>
          <section class="card" aria-labelledby="contact-heading">
            <h2 id="contact-heading"><mat-icon>call</mat-icon>Kontakt</h2>
            <dl>
              <dt>Telefon</dt>
              <dd>{{ phone() ?? '—' }}</dd>
              <dt>E-mail</dt>
              <dd>{{ salon.email ?? '—' }}</dd>
              <dt>Adres</dt>
              <dd>{{ address() || '—' }}</dd>
              <dt>Założony</dt>
              <dd>
                {{ salon.createdAt | date: 'd.MM.yyyy' : 'Europe/Warsaw' }}
              </dd>
            </dl>
          </section>
        </div>
        <aside class="card panel" aria-label="Zarządzanie">
          <div class="status">
            <span>Status</span>
            <app-salon-status [status]="salon.status" />
          </div>
          <a
            mat-stroked-button
            [href]="pageUrl()"
            target="_blank"
            rel="noopener"
          >
            <mat-icon>open_in_new</mat-icon>
            Otwórz Wizytówkę
          </a>
          @if (salon.owner && !salon.owner.invitationAccepted) {
            <button
              mat-stroked-button
              [disabled]="busy() || salon.status === 'SUSPENDED'"
              (click)="resend()"
            >
              <mat-icon>send</mat-icon>
              Wyślij zaproszenie ponownie
            </button>
          }
          <div class="zone">
            @if (salon.status === 'ACTIVE') {
              <p class="muted">
                Zawieszenie wylogowuje Personel i ukrywa Wizytówkę.
              </p>
              <button
                mat-stroked-button
                class="danger"
                [disabled]="busy()"
                (click)="suspend()"
              >
                <mat-icon>block</mat-icon>
                Zawieś Salon
              </button>
            } @else {
              <p class="muted">
                Personel nie może się zalogować, Wizytówka jest ukryta.
              </p>
              <button mat-flat-button [disabled]="busy()" (click)="resume()">
                <mat-icon>play_arrow</mat-icon>
                Odwieś Salon
              </button>
            }
          </div>
        </aside>
      </div>
    } @else if (loadError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else {
      <mat-spinner diameter="32" aria-label="Wczytywanie" />
    }
  `,
  styleUrl: './salon-details-page.scss',
})
export class SalonDetailsPage implements OnInit {
  private readonly api = inject(AdminSalonsService);
  private readonly dialog = inject(MatDialog);
  protected readonly origin = inject(DOCUMENT).location.origin;

  readonly id = input.required<string>();

  protected readonly salon = signal<AdminSalonDetails | null>(null);
  protected readonly loadError = signal<string | null>(null);
  /** An action is in progress; the buttons wait for it. */
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly pageUrl = computed(
    () => `${this.origin}/${this.salon()?.slug ?? ''}`,
  );

  protected readonly messages = SLUG_ERROR_MESSAGES;
  /** The Salon's own current and old addresses are free to it. */
  protected readonly slug = new FormControl('', {
    nonNullable: true,
    validators: slugFormat,
    asyncValidators: slugFree(this.api, {
      id: () => this.id(),
      current: () => this.salon()?.slug,
    }),
  });
  private readonly slugValue = toSignal(this.slug.valueChanges, {
    initialValue: this.slug.value,
  });
  protected readonly slugStatus = toSignal(
    this.slug.statusChanges.pipe(startWith(this.slug.status)),
    { requireSync: true },
  );
  protected readonly slugChanged = computed(
    () => !!this.salon() && this.slugValue() !== this.salon()?.slug,
  );
  protected readonly address = computed(() => {
    const salon = this.salon();
    return salon ? addressLine(salon) : '';
  });
  protected readonly phone = computed(() => {
    const phone = this.salon()?.phone;
    return phone ? (parsePhone(phone)?.international ?? phone) : null;
  });

  async ngOnInit(): Promise<void> {
    try {
      this.show(await this.api.details(this.id()));
    } catch (error) {
      this.loadError.set(errorMessage(error));
    }
  }

  protected async suspend(): Promise<void> {
    const salon = this.salon();
    if (!salon) return;
    const confirmed = await firstValueFrom(
      this.dialog
        .open<SuspendSalonDialog, SuspendSalonDialogData, boolean>(
          SuspendSalonDialog,
          { data: { name: salon.name }, autoFocus: 'dialog' },
        )
        .afterClosed(),
    );
    if (!confirmed) return;
    await this.run(
      () => this.api.suspend(salon.id),
      'Salon jest zawieszony. Personel został wylogowany.',
    );
  }

  protected async resume(): Promise<void> {
    const salon = this.salon();
    if (!salon) return;
    await this.run(
      () => this.api.resume(salon.id),
      'Salon jest znów aktywny. Personel może się logować.',
    );
  }

  protected async resend(): Promise<void> {
    const salon = this.salon();
    if (!salon?.owner) return;
    await this.run(
      () => this.api.resendInvitation(salon.id),
      `Nowe zaproszenie poszło na ${salon.owner.email}. Poprzedni link przestał działać.`,
    );
  }

  protected async changeSlug(event: Event): Promise<void> {
    event.preventDefault();
    const salon = this.salon();
    const slug = this.slug.value;
    if (!salon || !this.slugChanged() || this.slug.status !== 'VALID') return;
    await this.run(
      () => this.api.changeSlug(salon.id, slug),
      `Adres wizytówki to teraz ${this.origin}/${slug}. Stary adres przekierowuje na nowy.`,
      (error) => {
        // Another Salon took it after the check: the field says so.
        if (
          error instanceof HttpErrorResponse &&
          error.status === 409 &&
          errorMessage(error) === SLUG_ERROR_MESSAGES.TAKEN
        ) {
          this.slug.setErrors({ slug: 'TAKEN' });
          return true;
        }
        return false;
      },
    );
  }

  protected slugReason(): SlugUnavailableReason {
    return slugReason(this.slug);
  }

  /** The address field follows the Salon, e.g. after a change. */
  private show(salon: AdminSalonDetails): void {
    this.salon.set(salon);
    this.slug.setValue(salon.slug);
  }

  /**
   * Runs one action at a time; one that returns the Salon updates the page.
   * `handled` may show an error in place, instead of above the cards.
   */
  private async run(
    call: () => Promise<AdminSalonDetails | void>,
    notice: string,
    handled: (error: unknown) => boolean = () => false,
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.notice.set(null);
    this.actionError.set(null);
    try {
      const salon = await call();
      if (salon) this.show(salon);
      this.notice.set(notice);
    } catch (error) {
      if (!handled(error)) this.actionError.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

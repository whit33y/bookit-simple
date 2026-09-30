import { Component, inject, OnInit, signal, viewChild } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabGroup, MatTabsModule } from '@angular/material/tabs';
import {
  ACCENT_COLOR_INVALID,
  ACCENT_COLOR_PATTERN,
  addressLine,
  isSafeMapUrl,
  MAP_URL_INVALID,
  MAP_URL_MAX_LENGTH,
  PageSections,
  parsePhone,
  PHONE_INVALID,
  PhotoView,
  photoUrl,
  POSTAL_CODE_INVALID,
  POSTAL_CODE_PATTERN,
  PRIVACY_NOTICE_MAX_LENGTH,
  privacyNoticeTemplate,
  SALON_ABOUT_MAX_LENGTH,
  SALON_EMAIL_INVALID,
  SALON_TEXT_MAX_LENGTH,
  SalonPageSettings,
  UpdateSalonPageRequest,
} from '@bookit/shared';
import { errorMessage } from '../shared/error-message';
import { PhotoUpload } from '../shared/photo-upload';
import { SalonPageService } from './salon-page.service';

/** Sections in the order the Wizytówka shows them. */
const SECTIONS: { key: keyof PageSections; label: string }[] = [
  { key: 'announcements', label: 'Ogłoszenia' },
  { key: 'about', label: 'O nas' },
  { key: 'pricing', label: 'Cennik' },
  { key: 'team', label: 'Zespół' },
  { key: 'gallery', label: 'Galeria' },
  { key: 'hours', label: 'Godziny otwarcia' },
  { key: 'contact', label: 'Kontakt' },
];

const optional =
  (valid: (value: string) => boolean, error: string): ValidatorFn =>
  (control: AbstractControl) => {
    const value = (control.value as string).trim();
    return value && !valid(value) ? { [error]: true } : null;
  };

const textControl = (...validators: ValidatorFn[]) =>
  new FormControl('', { nonNullable: true, validators });

const sectionsForm = () =>
  new FormGroup(
    Object.fromEntries(
      SECTIONS.map(({ key }) => [
        key,
        new FormControl(true, { nonNullable: true }),
      ]),
    ) as Record<keyof PageSections, FormControl<boolean>>,
  );

/** Tabs in order; a failed save opens the first one with an error. */
const TABS = ['details', 'appearance', 'sections', 'privacy'] as const;

/**
 * `/panel/ustawienia/wizytowka`: the Właściciel sets what the Wizytówka shows. Four
 * tabs share one form and one "Zapisz"; photos are uploaded at once but saved with it.
 */
@Component({
  selector: 'app-page-settings-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTabsModule,
    PhotoUpload,
    ReactiveFormsModule,
  ],
  templateUrl: './page-settings-page.html',
  styleUrl: './page-settings-page.scss',
})
export class PageSettingsPage implements OnInit {
  private readonly api = inject(SalonPageService);
  private readonly tabs = viewChild(MatTabGroup);

  protected readonly sectionList = SECTIONS;
  protected readonly messages = {
    phone: PHONE_INVALID,
    email: SALON_EMAIL_INVALID,
    postalCode: POSTAL_CODE_INVALID,
    mapUrl: MAP_URL_INVALID,
    color: ACCENT_COLOR_INVALID,
  };
  protected readonly limits = {
    text: SALON_TEXT_MAX_LENGTH,
    about: SALON_ABOUT_MAX_LENGTH,
    privacy: PRIVACY_NOTICE_MAX_LENGTH,
  };

  protected readonly form = new FormGroup({
    details: new FormGroup({
      about: textControl(Validators.maxLength(SALON_ABOUT_MAX_LENGTH)),
      street: textControl(Validators.maxLength(SALON_TEXT_MAX_LENGTH)),
      postalCode: textControl(Validators.pattern(POSTAL_CODE_PATTERN)),
      city: textControl(Validators.maxLength(SALON_TEXT_MAX_LENGTH)),
      phone: textControl(optional((raw) => parsePhone(raw) !== null, 'phone')),
      email: textControl(Validators.email),
      mapUrl: textControl(
        optional(isSafeMapUrl, 'mapUrl'),
        Validators.maxLength(MAP_URL_MAX_LENGTH),
      ),
    }),
    appearance: new FormGroup({
      accentColor: textControl(
        Validators.required,
        Validators.pattern(ACCENT_COLOR_PATTERN),
      ),
      logoPhotoId: new FormControl<string | null>(null),
      heroPhotoId: new FormControl<string | null>(null),
    }),
    sections: sectionsForm(),
    privacy: new FormGroup({
      privacyNotice: textControl(
        Validators.maxLength(PRIVACY_NOTICE_MAX_LENGTH),
      ),
    }),
  });

  protected readonly salon = signal<SalonPageSettings | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.fill(await this.api.get());
    } catch (error) {
      this.loadError.set(errorMessage(error));
    }
  }

  protected photoSrc(id: string | null): string | null {
    return id ? photoUrl(id) : null;
  }

  protected setPhoto(
    field: 'logoPhotoId' | 'heroPhotoId',
    photo: PhotoView | null,
  ): void {
    const control = this.form.controls.appearance.controls[field];
    control.setValue(photo?.id ?? null);
    control.markAsDirty();
  }

  /** The `<input type="color">` next to the hex field. */
  protected pickColor(value: string): void {
    const control = this.form.controls.appearance.controls.accentColor;
    control.setValue(value);
    control.markAsDirty();
  }

  /** Replaces the text with the template filled from the Dane tab; saved with "Zapisz". */
  protected fillPrivacyTemplate(): void {
    const salon = this.salon();
    if (!salon) return;
    const { street, postalCode, city, email } =
      this.form.controls.details.getRawValue();
    const control = this.form.controls.privacy.controls.privacyNotice;
    control.setValue(
      privacyNoticeTemplate({
        salonName: salon.name,
        address: addressLine({ street, postalCode, city }),
        email,
      }),
    );
    control.markAsDirty();
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.notice.set(null);
    this.actionError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      const tabs = this.tabs();
      if (tabs) {
        tabs.selectedIndex = TABS.findIndex(
          (name) => this.form.controls[name].invalid,
        );
      }
      this.actionError.set('Popraw zaznaczone pola');
      return;
    }
    this.saving.set(true);
    try {
      this.fill(await this.api.save(this.changes()));
      this.notice.set('Zapisano Wizytówkę');
    } catch (error) {
      this.actionError.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private changes(): UpdateSalonPageRequest {
    const { details, appearance, sections, privacy } = this.form.getRawValue();
    return { ...details, ...appearance, sections, ...privacy };
  }

  private fill(salon: SalonPageSettings): void {
    this.salon.set(salon);
    const text = (value: string | null) => value ?? '';
    this.form.reset({
      details: {
        about: text(salon.about),
        street: text(salon.street),
        postalCode: text(salon.postalCode),
        city: text(salon.city),
        phone: salon.phone
          ? (parsePhone(salon.phone)?.international ?? salon.phone)
          : '',
        email: text(salon.email),
        mapUrl: text(salon.mapUrl),
      },
      appearance: {
        accentColor: salon.accentColor,
        logoPhotoId: salon.logoPhotoId,
        heroPhotoId: salon.heroPhotoId,
      },
      sections: salon.sections,
      privacy: { privacyNotice: text(salon.privacyNotice) },
    });
  }
}

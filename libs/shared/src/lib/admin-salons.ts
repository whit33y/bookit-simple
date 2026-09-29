import { SlugUnavailableReason } from './slug';

/** `POST /api/admin/salons` body. Contact details are optional; the Właściciel fills them in later. */
export interface CreateSalonRequest {
  name: string;
  /** Adres wizytówki */
  slug: string;
  ownerName: string;
  ownerEmail: string;
  /** Any common format; stored in E.164. */
  phone?: string | null;
  email?: string | null;
  street?: string | null;
  /** `00-000` */
  postalCode?: string | null;
  city?: string | null;
}

/** `201` reply: the Salon exists and the Właściciel got the invitation. */
export interface CreateSalonResponse {
  id: string;
  slug: string;
}

/** `GET /api/admin/salons/slug-available?slug=` */
export interface SlugAvailabilityResponse {
  available: boolean;
  /** Why not; `null` when available. */
  reason: SlugUnavailableReason | null;
}

export const POSTAL_CODE_PATTERN = /^\d{2}-\d{3}$/;
export const POSTAL_CODE_INVALID = 'Kod pocztowy wpisz jako 00-000';
/** `409`: in the MVP one person belongs to one Salon, and the Administrator has no Salon. */
export const OWNER_EMAIL_TAKEN = 'Ten e-mail ma już konto w Bookit';

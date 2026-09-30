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

/** `PATCH /api/admin/salons/:id` body. The old address goes to the redirects. */
export interface ChangeSlugRequest {
  /** Adres wizytówki */
  slug: string;
}

/** `GET /api/admin/salons/slug-available?slug=&salonId=` */
export interface SlugAvailabilityResponse {
  available: boolean;
  /** Why not; `null` when available. */
  reason: SlugUnavailableReason | null;
}

export const POSTAL_CODE_PATTERN = /^\d{2}-\d{3}$/;
export const POSTAL_CODE_INVALID = 'Kod pocztowy wpisz jako 00-000';
/** `409`: in the MVP one person belongs to one Salon, and the Administrator has no Salon. */
export const OWNER_EMAIL_TAKEN = 'Ten e-mail ma już konto w Bookit';

export type SalonStatus = 'ACTIVE' | 'SUSPENDED';

/** The Właściciel as the Administrator sees them. */
export interface AdminSalonOwner {
  displayName: string;
  email: string;
  /** Has set the password from the invitation. */
  invitationAccepted: boolean;
}

/** One row of `GET /api/admin/salons`, newest first. */
export interface AdminSalonSummary {
  id: string;
  name: string;
  /** Adres wizytówki */
  slug: string;
  status: SalonStatus;
  /** ISO 8601 */
  createdAt: string;
  /** `null` only if the Właściciel was removed from the Personel. */
  owner: AdminSalonOwner | null;
}

/** `GET /api/admin/salons/:id`, also the reply to suspend and resume. */
export interface AdminSalonDetails extends AdminSalonSummary {
  phone: string | null;
  email: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
}

/** `409` from `resend-invitation`. */
export const INVITATION_ALREADY_ACCEPTED = 'Właściciel już przyjął zaproszenie';
/** `409` from `resend-invitation`: a suspended Salon's invitation cannot be accepted. */
export const RESEND_SALON_SUSPENDED =
  'Salon jest zawieszony. Odwieś go, zanim wyślesz zaproszenie';

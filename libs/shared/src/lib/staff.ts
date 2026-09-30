import { OWNER_EMAIL_TAKEN } from './admin-salons';

/** Roles in the Personel, in the order forms offer them. */
export const STAFF_ROLES = ['EMPLOYEE', 'OWNER'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Polish names of the roles, for the UI. */
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  OWNER: 'Właściciel',
  EMPLOYEE: 'Pracownik',
};

/**
 * Where the person's invitation stands: they set the password (`ACCEPTED`), a link
 * is waiting (`PENDING`), or the last link expired and a new one is needed (`EXPIRED`).
 */
export type InvitationStatus = 'ACCEPTED' | 'PENDING' | 'EXPIRED';

/** One person of the Personel in `GET /api/staff`, in their order in the Salon. */
export interface StaffMemberView {
  id: string;
  displayName: string;
  /** `null` only for a person removed from the Personel, who is never listed. */
  email: string | null;
  role: StaffRole;
  invitation: InvitationStatus;
  /** Przyjmuje Wizyty: has a column in the calendar. */
  acceptsVisits: boolean;
  /** Shown in the Zespół section of the Wizytówka. */
  showOnPage: boolean;
  photoId: string | null;
  bio: string | null;
}

/** `POST /api/staff/invite` body. Replies `201` with the new `StaffMemberView`. */
export interface InviteStaffRequest {
  displayName: string;
  email: string;
  role: StaffRole;
}

/** `PATCH /api/staff/:id` body: any of these fields. Replies with the `StaffMemberView`. */
export interface UpdateStaffRequest {
  displayName?: string;
  role?: StaffRole;
  acceptsVisits?: boolean;
  showOnPage?: boolean;
  photoId?: string | null;
  bio?: string | null;
}

/** `PUT /api/staff/order` body: every person of the Personel, in the new order. Replies `204`. */
export interface StaffOrderRequest {
  ids: string[];
}

export const STAFF_BIO_MAX_LENGTH = 1000;

/** `409` from `invite`: in the MVP one person belongs to one Salon. */
export const STAFF_EMAIL_TAKEN = OWNER_EMAIL_TAKEN;
/** `422` from `PATCH`: the Salon must keep someone who manages it. */
export const LAST_OWNER = 'Salon musi mieć co najmniej jednego Właściciela';
/** `409` from `resend-invitation`. */
export const STAFF_INVITATION_ACCEPTED = 'Ta osoba już przyjęła zaproszenie';
/** `400` from `PUT /api/staff/order`. */
export const STAFF_ORDER_MISMATCH =
  'Lista musi zawierać każdą osobę z Personelu dokładnie raz';
/** `400` from `PATCH` for a `photoId` the Salon does not have. */
export const STAFF_PHOTO_NOT_FOUND = 'Nie ma takiego zdjęcia';

/**
 * `GET /api/staff/:id/deletion-preview`: what removing the person touches, for the
 * question "Zachować Wizyty?". Past means started before now, in any Stan Wizyty.
 */
export interface StaffDeletionPreview {
  pastVisits: number;
  futureVisits: number;
  /** Start of the last `SCHEDULED` Wizyta; the calendar keeps the column until that day. */
  lastScheduledVisitAt: string | null;
}

/** `422` from `DELETE /api/staff/:id` for the Właściciel's own row. */
export const STAFF_DELETE_SELF = 'Nie możesz usunąć samego siebie';
/** `400` from `DELETE /api/staff/:id` without `keepVisits=true|false`. */
export const STAFF_KEEP_VISITS_REQUIRED = 'Zdecyduj, czy zachować Wizyty';

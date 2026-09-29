import { Prisma } from '../../generated/prisma/client';

/**
 * Models with a `salonId` column, covered by Salon isolation (ADR 0001).
 * A test checks this list against the Prisma schema, so a new table cannot be left out.
 */
export const ISOLATED_MODELS = [
  'SalonSlugRedirect',
  'StaffMember',
  'ServiceCategory',
  'Service',
  'OpeningHours',
  'Announcement',
  'Photo',
  'GalleryItem',
  'Client',
  'Visit',
  'Absence',
  'VisitChange',
] as const satisfies readonly Prisma.ModelName[];

/**
 * Models without `salonId` that still belong to one Salon, by their own id or a parent.
 * In a Salon context their queries get this filter; without one they pass,
 * so the Wizytówka and login can find a Salon or an Invitation.
 */
export const SALON_LINKED_MODELS = {
  Salon: (salonId: string) => ({ id: salonId }),
  VisitService: (salonId: string) => ({ visit: { salonId } }),
  Invitation: (salonId: string) => ({ staffMember: { salonId } }),
} satisfies Partial<Record<Prisma.ModelName, (salonId: string) => object>>;

/** Models that belong to no Salon: accounts, their sessions and password resets. */
export const GLOBAL_MODELS = [
  'User',
  'Session',
  'PasswordReset',
] as const satisfies readonly Prisma.ModelName[];

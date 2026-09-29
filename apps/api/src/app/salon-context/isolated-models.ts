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

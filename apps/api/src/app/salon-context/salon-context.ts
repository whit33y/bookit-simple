import { ClsStore } from 'nestjs-cls';
import { StaffRole } from '../../generated/prisma/client';

/**
 * Who is asking, kept in AsyncLocalStorage for the whole request (`nestjs-cls`).
 * `SalonContextGuard` fills it from the logged-in person; the Prisma extension reads it.
 */
export interface SalonContext extends ClsStore {
  /** The Salon whose data every query is limited to. */
  salonId?: string;
  staffMemberId?: string;
  role?: StaffRole;
  isAdministrator?: boolean;
  /** Set by `@AdminScope()`: the Administrator path, where the Salon filter is off. */
  adminScope?: boolean;
}

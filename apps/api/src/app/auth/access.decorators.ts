import { applyDecorators, SetMetadata } from '@nestjs/common';
import { StaffRole } from '../../generated/prisma/client';
import { AdminScope } from '../salon-context/admin-scope.decorator';

/** Who can call an endpoint: the Administrator or a role in the Personel of a Salon. */
export type Role = 'ADMINISTRATOR' | StaffRole;

/** `'public'` or the roles let in; read by `AccessGuard`. */
export type Access = 'public' | readonly Role[];

export const ACCESS = 'bookit:access';

/**
 * Access of an endpoint without a decorator: the Personel of a Salon.
 * The Administrator gets `403` there: they do not see calendars or Clients of Salons.
 */
export const PERSONEL_ACCESS: readonly Role[] = ['OWNER', 'EMPLOYEE'];

const access = (value: Access) => SetMetadata(ACCESS, value);

/** No login needed. */
export const Public = () => access('public');

/** Only these roles in the Personel of a Salon, e.g. `@Roles('OWNER')`. */
export const Roles = (...roles: [StaffRole, ...StaffRole[]]) => access(roles);

/** Only the Administrator; also turns on `@AdminScope()`, so queries see every Salon. */
export const AdminOnly = () =>
  applyDecorators(access(['ADMINISTRATOR']), AdminScope());

/** Anyone logged in, the Administrator included, e.g. `GET /api/auth/me`. */
export const AnyRole = () => access(['ADMINISTRATOR', 'OWNER', 'EMPLOYEE']);

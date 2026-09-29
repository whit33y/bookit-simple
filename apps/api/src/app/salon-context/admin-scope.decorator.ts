import { SetMetadata } from '@nestjs/common';

export const ADMIN_SCOPE = 'bookit:admin-scope';

/**
 * Marks an Administrator route (controller or handler). Only the Administrator gets in,
 * and queries there are not limited to one Salon (ADR 0001).
 */
export const AdminScope = () => SetMetadata(ADMIN_SCOPE, true);

import { MeResponse } from '@bookit/shared';

// For tests only.
export const OWNER: MeResponse = {
  user: { id: 'u1', email: 'anna@studiokora.pl', isAdministrator: false },
  staffMember: { id: 's1', displayName: 'Anna' },
  salon: { id: 'sal1', name: 'Studio Kora', slug: 'studio-kora' },
  role: 'OWNER',
};

export const ADMINISTRATOR: MeResponse = {
  user: { id: 'u0', email: 'admin@bookit.local', isAdministrator: true },
  staffMember: null,
  salon: null,
  role: null,
};

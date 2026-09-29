/** `POST /api/auth/login` body. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** `GET /api/auth/me`: the logged-in person. The Administrator has no Salon. */
export interface MeResponse {
  user: { id: string; email: string; isAdministrator: boolean };
  staffMember: { id: string; displayName: string } | null;
  salon: { id: string; name: string; slug: string } | null;
  role: 'OWNER' | 'EMPLOYEE' | null;
}

/** Minimum password length, for setting it from an invitation or a reset. */
export const MIN_PASSWORD_LENGTH = 10;

/** `GET /api/auth/invitations/:token`: what the screen for setting the password shows. */
export interface InvitationResponse {
  salonName: string;
  displayName: string;
}

/** `POST /api/auth/accept-invitation` body. Replies with `MeResponse`, like login. */
export interface AcceptInvitationRequest {
  token: string;
  password: string;
}

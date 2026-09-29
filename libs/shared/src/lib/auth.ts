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

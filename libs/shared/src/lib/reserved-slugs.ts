/**
 * Names a Salon cannot take as its Adres wizytówki, because `/{slug}` shares
 * the URL space with top-level routes (ADR 0002). Every new top-level route in
 * `apps/web` must be added here.
 */
export const RESERVED_SLUGS: readonly string[] = [
  'admin',
  'api',
  'app',
  'panel',
  'login',
  'logowanie',
  'zaproszenie',
  'reset-hasla',
  'www',
  'static',
  'assets',
  'health',
];

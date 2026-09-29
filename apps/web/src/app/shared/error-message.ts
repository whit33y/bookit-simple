import { HttpErrorResponse } from '@angular/common/http';

const TOO_MANY = 'Za dużo prób. Spróbuj ponownie za kilka minut.';
const OFFLINE = 'Nie udało się połączyć z serwerem. Sprawdź internet i spróbuj ponownie.';
const SERVER = 'Wystąpił błąd serwera. Spróbuj ponownie za chwilę.';
const GENERIC = 'Coś poszło nie tak. Spróbuj ponownie.';

/**
 * What to show under a form after a failed request. The API's messages meant for people
 * are in Polish (e.g. "Nieprawidłowy e-mail lub hasło"). Nest adds `error` to the body
 * only when an exception was given its own message; a bare one (`message: "Bad Request"`)
 * gets a generic Polish text instead.
 */
export function errorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return GENERIC;
  if (error.status === 0) return OFFLINE;
  if (error.status === 429) return TOO_MANY;
  if (error.status >= 500) return SERVER;
  const body = error.error as { message?: unknown; error?: unknown } | null;
  return typeof body?.message === 'string' && typeof body.error === 'string'
    ? body.message
    : GENERIC;
}

import { HttpErrorResponse } from '@angular/common/http';

const TOO_MANY = 'Za dużo prób. Spróbuj ponownie za kilka minut.';
const OFFLINE = 'Nie udało się połączyć z serwerem. Spróbuj ponownie.';
const GENERIC = 'Coś poszło nie tak. Spróbuj ponownie.';

/** Polish letters, which the API's own messages have and the framework's English ones do not. */
const POLISH = /[ąćęłńóśźż]/i;

/**
 * What to show under a form after a failed request. The API sends messages meant for
 * people in Polish (e.g. "Nieprawidłowy e-mail lub hasło"); anything else gets a generic one.
 */
export function errorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return GENERIC;
  if (error.status === 0 || error.status >= 500) return OFFLINE;
  if (error.status === 429) return TOO_MANY;
  const message: unknown = error.error?.message;
  return typeof message === 'string' && POLISH.test(message) ? message : GENERIC;
}

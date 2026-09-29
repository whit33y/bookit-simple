import { HttpErrorResponse } from '@angular/common/http';
import { errorMessage } from './error-message';

const httpError = (status: number, error: unknown = null) =>
  new HttpErrorResponse({ status, error });

describe('errorMessage', () => {
  it('shows the Polish message the API sent', () => {
    expect(
      errorMessage(httpError(401, { message: 'Nieprawidłowy e-mail lub hasło' })),
    ).toBe('Nieprawidłowy e-mail lub hasło');
  });

  it('asks to wait after too many attempts', () => {
    expect(errorMessage(httpError(429, { message: 'ThrottlerException: Too Many Requests' }))).toBe(
      'Za dużo prób. Spróbuj ponownie za kilka minut.',
    );
  });

  it('does not show English messages from the framework', () => {
    expect(errorMessage(httpError(400, { message: 'Bad Request' }))).toBe(
      'Coś poszło nie tak. Spróbuj ponownie.',
    );
  });

  it('says the server is unreachable when there is no response or it failed', () => {
    const offline = 'Nie udało się połączyć z serwerem. Spróbuj ponownie.';
    expect(errorMessage(httpError(0))).toBe(offline);
    expect(errorMessage(httpError(502))).toBe(offline);
  });
});

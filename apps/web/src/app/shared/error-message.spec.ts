import { HttpErrorResponse } from '@angular/common/http';
import { errorMessage } from './error-message';

const httpError = (status: number, error: unknown = null) =>
  new HttpErrorResponse({ status, error });

describe('errorMessage', () => {
  it('shows the message the API gave the exception', () => {
    expect(
      errorMessage(
        httpError(401, {
          statusCode: 401,
          message: 'Nieprawidłowy e-mail lub hasło',
          error: 'Unauthorized',
        }),
      ),
    ).toBe('Nieprawidłowy e-mail lub hasło');
  });

  it('asks to wait after too many attempts', () => {
    expect(
      errorMessage(
        httpError(429, {
          statusCode: 429,
          message: 'ThrottlerException: Too Many Requests',
        }),
      ),
    ).toBe('Za dużo prób. Spróbuj ponownie za kilka minut.');
  });

  it('does not show the English default of a bare exception', () => {
    expect(
      errorMessage(httpError(400, { statusCode: 400, message: 'Bad Request' })),
    ).toBe('Coś poszło nie tak. Spróbuj ponownie.');
  });

  it('tells a missing connection from a failing server', () => {
    expect(errorMessage(httpError(0))).toBe(
      'Nie udało się połączyć z serwerem. Sprawdź internet i spróbuj ponownie.',
    );
    expect(
      errorMessage(httpError(500, { statusCode: 500, message: 'Internal server error' })),
    ).toBe('Wystąpił błąd serwera. Spróbuj ponownie za chwilę.');
  });
});

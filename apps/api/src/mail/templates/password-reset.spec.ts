import { passwordResetEmail } from './password-reset';

describe('passwordResetEmail', () => {
  it('has the link and the expiry in both versions', () => {
    const email = passwordResetEmail({
      link: 'http://localhost:4200/reset-hasla/abc',
      expiresAt: new Date('2026-10-06T10:30:00Z'),
    });

    expect(email.subject).toBe('Zmiana hasła w Bookit');
    for (const body of [email.text, email.html]) {
      expect(body).toContain('http://localhost:4200/reset-hasla/abc');
      // Polish time, not UTC.
      expect(body).toContain('6 października 2026 12:30');
    }
  });
});

import { invitationEmail } from './invitation';

describe('invitationEmail', () => {
  const params = {
    salonName: 'Studio Anna',
    inviterName: 'Anna',
    link: 'http://localhost:4200/zaproszenie/abc',
    expiresAt: new Date('2026-10-06T10:30:00Z'),
  };

  it('names the Salon, who invites, the link and the expiry in both versions', () => {
    const email = invitationEmail(params);

    expect(email.subject).toBe('Zaproszenie do Salonu Studio Anna');
    for (const body of [email.text, email.html]) {
      expect(body).toContain('Studio Anna');
      expect(body).toContain('Anna');
      expect(body).toContain('http://localhost:4200/zaproszenie/abc');
      // Polish time, not UTC.
      expect(body).toContain('6 października 2026 12:30');
    }
  });

  it('escapes names in the HTML version', () => {
    const email = invitationEmail({
      ...params,
      salonName: '<b>Studio</b> & Spa',
    });

    expect(email.html).toContain('&lt;b&gt;Studio&lt;/b&gt; &amp; Spa');
    expect(email.html).not.toContain('<b>Studio</b>');
    expect(email.text).toContain('<b>Studio</b> & Spa');
  });
});

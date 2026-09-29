import { escapeHtml } from './escape-html';
import { formatDateTime, MailContent } from './mail-content';

export interface InvitationEmailParams {
  salonName: string;
  /** Who invites: the Właściciel's name, or the Administrator. */
  inviterName: string;
  /** `${APP_URL}/zaproszenie/{token}` */
  link: string;
  expiresAt: Date;
}

export function invitationEmail({
  salonName,
  inviterName,
  link,
  expiresAt,
}: InvitationEmailParams): MailContent {
  const expires = formatDateTime(expiresAt);

  const text = `Dzień dobry,

${inviterName} zaprasza Cię do Personelu Salonu ${salonName} w Bookit.

Aby dołączyć, ustaw hasło pod tym adresem:
${link}

Link jest ważny do ${expires}. Jeśli nie spodziewasz się tego zaproszenia, zignoruj tę wiadomość.

Bookit
`;

  const html = `<!doctype html>
<html lang="pl">
  <body style="font-family: Arial, sans-serif; color: #222; line-height: 1.5">
    <p>Dzień dobry,</p>
    <p>
      <strong>${escapeHtml(inviterName)}</strong> zaprasza Cię do Personelu Salonu
      <strong>${escapeHtml(salonName)}</strong> w Bookit.
    </p>
    <p>
      <a href="${escapeHtml(link)}"
         style="display: inline-block; padding: 10px 20px; background: #222; color: #fff; text-decoration: none; border-radius: 4px">Ustaw hasło</a>
    </p>
    <p>Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:<br />${escapeHtml(link)}</p>
    <p>Link jest ważny do ${escapeHtml(expires)}. Jeśli nie spodziewasz się tego zaproszenia, zignoruj tę wiadomość.</p>
    <p>Bookit</p>
  </body>
</html>
`;

  return { subject: `Zaproszenie do Salonu ${salonName}`, html, text };
}

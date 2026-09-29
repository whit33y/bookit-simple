import { escapeHtml } from './escape-html';
import { formatDateTime, MailContent } from './mail-content';

export interface PasswordResetEmailParams {
  /** `${APP_URL}/reset-hasla/{token}` */
  link: string;
  expiresAt: Date;
}

export function passwordResetEmail({
  link,
  expiresAt,
}: PasswordResetEmailParams): MailContent {
  const expires = formatDateTime(expiresAt);

  const text = `Dzień dobry,

ktoś poprosił o zmianę hasła do Twojego konta w Bookit.

Aby ustawić nowe hasło, otwórz ten adres:
${link}

Link jest ważny do ${expires} i działa jeden raz. Po zmianie hasła wylogujemy Cię na wszystkich urządzeniach. Jeśli to nie Ty, zignoruj tę wiadomość: hasło zostanie bez zmian.

Bookit
`;

  const html = `<!doctype html>
<html lang="pl">
  <body style="font-family: Arial, sans-serif; color: #222; line-height: 1.5">
    <p>Dzień dobry,</p>
    <p>ktoś poprosił o zmianę hasła do Twojego konta w Bookit.</p>
    <p>
      <a href="${escapeHtml(link)}"
         style="display: inline-block; padding: 10px 20px; background: #222; color: #fff; text-decoration: none; border-radius: 4px">Ustaw nowe hasło</a>
    </p>
    <p>Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:<br />${escapeHtml(link)}</p>
    <p>Link jest ważny do ${escapeHtml(expires)} i działa jeden raz. Po zmianie hasła wylogujemy Cię na wszystkich urządzeniach. Jeśli to nie Ty, zignoruj tę wiadomość: hasło zostanie bez zmian.</p>
    <p>Bookit</p>
  </body>
</html>
`;

  return { subject: 'Zmiana hasła w Bookit', html, text };
}

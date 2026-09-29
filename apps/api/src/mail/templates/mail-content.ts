/** What a template renders: `MailService.send` adds the sender and the recipient. */
export interface MailContent {
  subject: string;
  html: string;
  text: string;
}

/** Dates in e-mails are Polish time, e.g. "6 października 2026 12:30". */
export function formatDateTime(date: Date): string {
  return date.toLocaleString('pl-PL', {
    timeZone: 'Europe/Warsaw',
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

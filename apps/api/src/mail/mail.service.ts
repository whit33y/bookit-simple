import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { Env } from '../app/config/env';
import { MailContent } from './templates/mail-content';

export interface Mail extends MailContent {
  to: string;
}

/** Sends e-mail over SMTP from the config. Locally Mailpit, preview at `http://localhost:8025`. */
@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.from = config.get('MAIL_FROM', { infer: true });
    this.transporter = createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
    });
  }

  async send({ to, subject, html, text }: Mail): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html,
      text,
    });
  }
}

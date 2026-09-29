import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** E-mail templates in Polish (`templates/`) and SMTP sending. */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

import { Module } from '@nestjs/common';
import { MailModule } from '../../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';

/** Setting a new password from a link sent by e-mail. */
@Module({
  imports: [AuthModule, MailModule],
  controllers: [PasswordResetController],
  providers: [PasswordResetService],
})
export class PasswordResetModule {}

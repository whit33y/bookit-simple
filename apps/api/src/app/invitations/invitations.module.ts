import { Module } from '@nestjs/common';
import { MailModule } from '../../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';

/** Invitations to the Personel and setting the password from them. */
@Module({
  imports: [AuthModule, MailModule],
  controllers: [InvitationController],
  providers: [InvitationService],
  exports: [InvitationService],
})
export class InvitationsModule {}

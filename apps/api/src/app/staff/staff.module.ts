import { Module } from '@nestjs/common';
import { InvitationsModule } from '../invitations/invitations.module';
import { PhotosModule } from '../photos/photos.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

/** `/api/staff`: the Personel of the Salon, invitations to it (#14). */
@Module({
  imports: [InvitationsModule, PhotosModule],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}

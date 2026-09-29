import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { AdminSalonsController } from './admin-salons.controller';
import { AdminSalonsService } from './admin-salons.service';

/** `/api/admin/salons`: the Administrator creates and manages Salons. */
@Module({
  imports: [AuthModule, InvitationsModule],
  controllers: [AdminSalonsController],
  providers: [AdminSalonsService],
})
export class AdminSalonsModule {}

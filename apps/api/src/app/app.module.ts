import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminSalonsModule } from './admin-salons/admin-salons.module';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { InvitationsModule } from './invitations/invitations.module';
import { PasswordResetModule } from './password-reset/password-reset.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublicPagesModule } from './public-pages/public-pages.module';
import { SalonContextModule } from './salon-context/salon-context.module';
import { StaffModule } from './staff/staff.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    SalonContextModule,
    PrismaModule,
    AuthModule,
    InvitationsModule,
    AdminSalonsModule,
    PasswordResetModule,
    PublicPagesModule,
    StaffModule,
    HealthModule.register(),
  ],
})
export class AppModule {}

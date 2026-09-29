import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { InvitationsModule } from './invitations/invitations.module';
import { PrismaModule } from './prisma/prisma.module';
import { SalonContextModule } from './salon-context/salon-context.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    SalonContextModule,
    PrismaModule,
    AuthModule,
    InvitationsModule,
    HealthModule.register(),
  ],
})
export class AppModule {}

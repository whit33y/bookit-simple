import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { SalonContextModule } from './salon-context/salon-context.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    SalonContextModule,
    PrismaModule,
    HealthModule.register(),
  ],
})
export class AppModule {}

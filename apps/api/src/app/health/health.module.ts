import { DynamicModule, Module } from '@nestjs/common';
import { HEALTH_TIMEOUT_MS, HealthController } from './health.controller';
import {
  DbHealthIndicator,
  S3HealthIndicator,
  SmtpHealthIndicator,
} from './indicators';

@Module({})
export class HealthModule {
  static register({
    timeoutMs = 3000,
  }: { timeoutMs?: number } = {}): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [
        DbHealthIndicator,
        S3HealthIndicator,
        SmtpHealthIndicator,
        { provide: HEALTH_TIMEOUT_MS, useValue: timeoutMs },
      ],
    };
  }
}

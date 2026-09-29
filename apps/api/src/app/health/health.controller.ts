import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DbHealthIndicator,
  HealthIndicator,
  S3HealthIndicator,
  SmtpHealthIndicator,
} from './indicators';

export const HEALTH_TIMEOUT_MS = Symbol('HEALTH_TIMEOUT_MS');

type ServiceStatus = 'ok' | 'down';

export interface HealthReport {
  status: ServiceStatus;
  db: ServiceStatus;
  s3: ServiceStatus;
  smtp: ServiceStatus;
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DbHealthIndicator,
    private readonly s3: S3HealthIndicator,
    private readonly smtp: SmtpHealthIndicator,
    @Inject(HEALTH_TIMEOUT_MS) private readonly timeoutMs: number,
  ) {}

  @Get()
  async check(): Promise<HealthReport> {
    const [db, s3, smtp] = await Promise.all([
      this.probe(this.db),
      this.probe(this.s3),
      this.probe(this.smtp),
    ]);
    const report: HealthReport = {
      status: db === 'ok' && s3 === 'ok' && smtp === 'ok' ? 'ok' : 'down',
      db,
      s3,
      smtp,
    };
    if (report.status === 'down') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }

  private async probe(indicator: HealthIndicator): Promise<ServiceStatus> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), this.timeoutMs);
    });
    try {
      await Promise.race([indicator.check(), timeout]);
      return 'ok';
    } catch {
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}

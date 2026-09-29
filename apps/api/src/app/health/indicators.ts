import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { Env } from '../config/env';

/** Resolves when the service is reachable, rejects otherwise. */
export interface HealthIndicator {
  check(): Promise<void>;
}

@Injectable()
export class S3HealthIndicator implements HealthIndicator, OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Env, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: 'us-east-1',
      forcePathStyle: true,
      maxAttempts: 1,
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      },
    });
  }

  async check(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}

@Injectable()
export class SmtpHealthIndicator implements HealthIndicator {
  private readonly transporter: Transporter;

  constructor(config: ConfigService<Env, true>) {
    this.transporter = createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
    });
  }

  async check(): Promise<void> {
    await this.transporter.verify();
  }
}

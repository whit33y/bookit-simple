import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { Env } from '../config/env';
import { createS3Client } from '../config/s3-client';
import { PrismaService } from '../prisma/prisma.service';

/** Resolves when the service is reachable, rejects otherwise. */
export interface HealthIndicator {
  check(): Promise<void>;
}

@Injectable()
export class DbHealthIndicator implements HealthIndicator {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}

@Injectable()
export class S3HealthIndicator implements HealthIndicator, OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Env, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.client = createS3Client(config, { maxAttempts: 1 });
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

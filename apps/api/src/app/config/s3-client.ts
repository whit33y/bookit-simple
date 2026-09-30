import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Env } from './env';

/** MinIO locally, any S3-compatible storage on the hosting (ADR 0004). */
export function createS3Client(
  config: ConfigService<Env, true>,
  options: Partial<S3ClientConfig> = {},
): S3Client {
  return new S3Client({
    endpoint: config.get('S3_ENDPOINT', { infer: true }),
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
      secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
    },
    ...options,
  });
}

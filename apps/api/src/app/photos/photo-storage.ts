import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { Env } from '../config/env';
import { createS3Client } from '../config/s3-client';

/**
 * Where the files of Photos live. The api talks to it only through this class,
 * so tests swap in an in-memory one and CI runs without MinIO.
 */
export abstract class PhotoStorage {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** `null` when there is no file under the key. */
  abstract get(key: string): Promise<Readable | null>;
  /** No error when the file is already gone. */
  abstract delete(key: string): Promise<void>;
}

@Injectable()
export class S3PhotoStorage extends PhotoStorage implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    super();
    this.client = createS3Client(config);
    this.bucket = config.get('S3_BUCKET', { infer: true });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Readable | null> {
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return object.Body as Readable;
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}

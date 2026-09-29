import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { Env } from '../config/env';

/** Prisma 7 talks to Postgres through a driver adapter, not a bundled engine. */
function prismaOptions(connectionString: string) {
  return { adapter: new PrismaPg({ connectionString }) };
}

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient(prismaOptions(connectionString));
}

/**
 * Connects lazily on the first query, so `api` starts without the database
 * and `/api/health` can report `db: down`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super(prismaOptions(config.get('DATABASE_URL', { infer: true })));
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

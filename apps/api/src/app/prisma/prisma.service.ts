import { PrismaPg } from '@prisma/adapter-pg';
import { ClsService } from 'nestjs-cls';
import { PrismaClient } from '../../generated/prisma/client';
import { SalonContext } from '../salon-context/salon-context';
import { salonIsolation } from '../salon-context/salon-isolation.extension';

/** Prisma 7 talks to Postgres through a driver adapter, not a bundled engine. */
function prismaOptions(connectionString: string) {
  return { adapter: new PrismaPg({ connectionString }) };
}

/** Without Salon isolation: for the seed and scripts only, never inside the api. */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient(prismaOptions(connectionString));
}

/**
 * Prisma Client limited to the Salon from the request context (ADR 0001).
 * Connects lazily on the first query, so `api` starts without the database
 * and `/api/health` can report `db: down`.
 */
export function createIsolatedPrismaClient(
  connectionString: string,
  cls: ClsService<SalonContext>,
) {
  return createPrismaClient(connectionString).$extends(salonIsolation(cls));
}

export type IsolatedPrismaClient = ReturnType<
  typeof createIsolatedPrismaClient
>;

/**
 * Injection token for the isolated client. `$extends` returns a new object,
 * so the class only carries the type; `PrismaModule` provides the instance.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type
export interface PrismaService extends IsolatedPrismaClient {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class PrismaService {}

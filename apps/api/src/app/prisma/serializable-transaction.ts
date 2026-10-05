import { ConflictException } from '@nestjs/common';
import { WRITE_CONFLICT } from '@bookit/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from './prisma.service';

type Transaction = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/**
 * Retry a conflicting write using a fresh snapshot; failed attempts commit nothing.
 * `409` once the retries run out.
 */
export async function serializableTransaction<T>(
  prisma: PrismaService,
  operation: (tx: Transaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2034'
      )
        throw error;
      if (attempt >= 2) throw new ConflictException(WRITE_CONFLICT);
    }
  }
}

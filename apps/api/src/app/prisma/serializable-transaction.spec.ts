import { ConflictException } from '@nestjs/common';
import { WRITE_CONFLICT } from '@bookit/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from './prisma.service';
import { serializableTransaction } from './serializable-transaction';

const conflict = () =>
  new Prisma.PrismaClientKnownRequestError('write conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });

const prismaFailing = (...errors: Error[]) => {
  const $transaction = jest.fn();
  for (const error of errors) $transaction.mockRejectedValueOnce(error);
  $transaction.mockResolvedValue('done');
  return { prisma: { $transaction } as unknown as PrismaService, $transaction };
};

describe('serializableTransaction', () => {
  it('retries a write conflict and returns the later result', async () => {
    const { prisma, $transaction } = prismaFailing(conflict(), conflict());

    await expect(serializableTransaction(prisma, jest.fn())).resolves.toBe(
      'done',
    );
    expect($transaction).toHaveBeenCalledTimes(3);
  });

  it('answers 409 once the retries run out', async () => {
    const { prisma, $transaction } = prismaFailing(
      conflict(),
      conflict(),
      conflict(),
    );

    const result = serializableTransaction(prisma, jest.fn());

    await expect(result).rejects.toBeInstanceOf(ConflictException);
    await expect(result).rejects.toThrow(WRITE_CONFLICT);
    expect($transaction).toHaveBeenCalledTimes(3);
  });

  it('passes any other error through without retrying', async () => {
    const other = new Error('boom');
    const { prisma, $transaction } = prismaFailing(other);

    await expect(serializableTransaction(prisma, jest.fn())).rejects.toBe(
      other,
    );
    expect($transaction).toHaveBeenCalledTimes(1);
  });
});

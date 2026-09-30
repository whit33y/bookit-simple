import { Inject, Injectable } from '@nestjs/common';
import {
  DELETED_CLIENT_NAME,
  VisitChangeAction,
  VisitSnapshot,
} from '@bookit/shared';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';

/** What a Wizyta needs loaded to be copied into the Historia zmian. */
export const visitDetailsInclude = {
  services: { orderBy: [{ createdAt: 'asc' }, { nameSnapshot: 'asc' }] },
  staffMember: { select: { displayName: true } },
  client: { select: { name: true } },
} satisfies Prisma.VisitInclude;

export type VisitWithDetails = Prisma.VisitGetPayload<{
  include: typeof visitDetailsInclude;
}>;

type Db = Pick<PrismaService, 'visitChange'>;

/** Entries whose Wizyta had this Klient before or after the change. */
export const aboutClient = (clientId: string) =>
  ({
    OR: [
      { before: { path: ['clientId'], equals: clientId } },
      { after: { path: ['clientId'], equals: clientId } },
    ],
  }) satisfies Prisma.VisitChangeWhereInput;

export function toSnapshot(visit: VisitWithDetails): VisitSnapshot {
  return {
    staffMemberId: visit.staffMemberId,
    staffMemberName: visit.staffMember.displayName,
    clientId: visit.clientId,
    clientName: visit.client.name,
    startsAt: visit.startsAt.toISOString(),
    durationMin: visit.durationMin,
    breakMin: visit.breakMin,
    description: visit.description,
    state: visit.state,
    services: visit.services.map((item) => ({
      serviceId: item.serviceId,
      name: item.nameSnapshot,
      priceGrosze: item.priceGroszeSnapshot,
      priceType: item.priceTypeSnapshot,
    })),
  };
}

const json = (snapshot: VisitSnapshot | null) =>
  snapshot === null
    ? Prisma.DbNull
    : (snapshot as unknown as Prisma.InputJsonObject);

/**
 * Writes the Historia zmian (#25). It takes the transaction of the change, so an entry
 * that fails to save rolls the change back, and there is no change without its entry.
 */
@Injectable()
export class VisitChangeRecorder {
  constructor(
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
  ) {}

  /** `before` is `null` for `CREATED`, `after` for `DELETED`. */
  async record(
    tx: Db,
    visitId: string,
    action: VisitChangeAction,
    before: VisitWithDetails | null,
    after: VisitWithDetails | null,
  ): Promise<void> {
    const salonId = this.cls.get('salonId');
    const staffMemberId = this.cls.get('staffMemberId');
    if (!salonId || !staffMemberId) {
      throw new Error(
        'VisitChangeRecorder needs a person in the Salon context',
      );
    }
    await tx.visitChange.create({
      data: {
        salonId,
        visitId,
        staffMemberId,
        action,
        before: json(before && toSnapshot(before)),
        after: json(after && toSnapshot(after)),
      },
    });
  }

  /** A deleted Klient (RODO) has no name in the Historia zmian either. */
  async forgetClient(tx: Db, clientId: string): Promise<void> {
    const changes = await tx.visitChange.findMany({
      where: aboutClient(clientId),
    });
    const forget = (value: Prisma.JsonValue) => {
      const snapshot = value as unknown as VisitSnapshot | null;
      return json(
        snapshot?.clientId === clientId
          ? { ...snapshot, clientName: DELETED_CLIENT_NAME }
          : snapshot,
      );
    };
    for (const change of changes) {
      await tx.visitChange.update({
        where: { id: change.id },
        data: { before: forget(change.before), after: forget(change.after) },
      });
    }
  }
}

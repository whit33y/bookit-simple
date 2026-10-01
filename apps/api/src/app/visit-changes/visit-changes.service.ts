import { Inject, Injectable } from '@nestjs/common';
import {
  CalendarDay,
  VISIT_CHANGES_PAGE_SIZE,
  VisitChangePage,
  VisitChangeView,
  VisitSnapshot,
  warsawDayBounds,
} from '@bookit/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { aboutClient } from './visit-change-recorder';

const withAuthor = {
  staffMember: { select: { displayName: true } },
} satisfies Prisma.VisitChangeInclude;

type ChangeWithAuthor = Prisma.VisitChangeGetPayload<{
  include: typeof withAuthor;
}>;

const newestFirst = [
  { at: 'desc' },
  { id: 'desc' },
] satisfies Prisma.VisitChangeOrderByWithRelationInput[];

const toView = (change: ChangeWithAuthor): VisitChangeView => ({
  id: change.id,
  visitId: change.visitId,
  at: change.at.toISOString(),
  action: change.action,
  staffMemberId: change.staffMemberId,
  staffMemberName: change.staffMember.displayName,
  before: change.before as unknown as VisitSnapshot | null,
  after: change.after as unknown as VisitSnapshot | null,
});

export interface VisitChangeFilter {
  day?: CalendarDay;
  staffId?: string;
  clientId?: string;
  page: number;
}

/**
 * Reads the Historia zmian of the Salon from the context (#25); the Prisma extension
 * limits every query to it.
 */
@Injectable()
export class VisitChangesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async forVisit(visitId: string): Promise<VisitChangeView[]> {
    const changes = await this.prisma.visitChange.findMany({
      where: { visitId },
      include: withAuthor,
      orderBy: newestFirst,
    });
    return changes.map(toView);
  }

  async list(filter: VisitChangeFilter): Promise<VisitChangePage> {
    const { day, staffId, clientId, page } = filter;
    const where: Prisma.VisitChangeWhereInput = {
      ...(staffId && { staffMemberId: staffId }),
      ...(clientId && aboutClient(clientId)),
      ...(day && {
        at: {
          gte: warsawDayBounds(day).startsAt,
          lt: warsawDayBounds(day).endsAt,
        },
      }),
    };
    const [changes, total] = await Promise.all([
      this.prisma.visitChange.findMany({
        where,
        include: withAuthor,
        orderBy: newestFirst,
        skip: (page - 1) * VISIT_CHANGES_PAGE_SIZE,
        take: VISIT_CHANGES_PAGE_SIZE,
      }),
      this.prisma.visitChange.count({ where }),
    ]);
    return {
      items: changes.map(toView),
      page,
      pageSize: VISIT_CHANGES_PAGE_SIZE,
      total,
    };
  }
}

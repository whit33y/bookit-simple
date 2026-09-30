import { Inject, Injectable } from '@nestjs/common';
import { OpeningHoursDay } from '@bookit/shared';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';
import { fromClockTime, toClockTime } from './clock-time';

/**
 * The Godziny otwarcia of the Salon from the context (#18). Queries are limited to that
 * Salon by the Prisma extension.
 */
@Injectable()
export class OpeningHoursService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
  ) {}

  /** Open weekdays only, Monday first. */
  async list(): Promise<OpeningHoursDay[]> {
    const days = await this.prisma.openingHours.findMany({
      orderBy: { weekday: 'asc' },
    });
    return days.map(({ weekday, opensAt, closesAt }) => ({
      weekday,
      opensAt: toClockTime(opensAt),
      closesAt: toClockTime(closesAt),
    }));
  }

  /** Replaces the whole week: a weekday left out becomes closed. */
  async replace(days: OpeningHoursDay[]): Promise<OpeningHoursDay[]> {
    const salonId = this.salonId();
    await this.prisma.$transaction(async (tx) => {
      await tx.openingHours.deleteMany({});
      await tx.openingHours.createMany({
        data: days.map(({ weekday, opensAt, closesAt }) => ({
          // The create input type requires it; the Salon filter checks it is the context's.
          salonId,
          weekday,
          opensAt: fromClockTime(opensAt),
          closesAt: fromClockTime(closesAt),
        })),
      });
    });
    return this.list();
  }

  private salonId(): string {
    const salonId = this.cls.get('salonId');
    if (!salonId) {
      throw new Error('OpeningHoursService needs a Salon context');
    }
    return salonId;
  }
}

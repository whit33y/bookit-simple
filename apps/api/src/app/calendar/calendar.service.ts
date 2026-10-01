import { Inject, Injectable } from '@nestjs/common';
import {
  CalendarDay,
  CalendarQuery,
  CalendarResponse,
  CalendarStaffMember,
  CalendarVisit,
  Holiday,
  polishHolidays,
  warsawDate,
  warsawDayBounds,
} from '@bookit/shared';
import { Prisma } from '../../generated/prisma/client';
import { toAbsenceView } from '../absences/absences.service';
import { OpeningHoursService } from '../opening-hours/opening-hours.service';
import { PrismaService } from '../prisma/prisma.service';
import { visitDetailsInclude } from '../visit-changes/visit-change-recorder';
import { LONGEST_VISIT_MS, visitInterval } from '../visits/find-collisions';
import { toVisitView } from '../visits/visits.service';

const calendarVisitInclude = {
  ...visitDetailsInclude,
  client: { select: { name: true, phoneE164: true } },
} satisfies Prisma.VisitInclude;

type VisitWithClient = Prisma.VisitGetPayload<{
  include: typeof calendarVisitInclude;
}>;

const toCalendarVisit = (visit: VisitWithClient): CalendarVisit => ({
  ...toVisitView(visit),
  client: visit.client,
});

const columnOrder = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
] satisfies Prisma.StaffMemberOrderByWithRelationInput[];

/** The Święta from `from` to `to`, both included. */
function holidaysBetween(from: CalendarDay, to: CalendarDay): Holiday[] {
  const holidays: Holiday[] = [];
  for (
    let year = Number(from.slice(0, 4));
    year <= Number(to.slice(0, 4));
    year++
  ) {
    holidays.push(...polishHolidays(year));
  }
  return holidays.filter(({ date }) => date >= from && date <= to);
}

/**
 * Everything the day and week views draw (#28), for the Salon from the context: the
 * Prisma extension limits every query to it. The range runs from the Warsaw midnight
 * starting `from` to the one ending `to`.
 */
@Injectable()
export class CalendarService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OpeningHoursService)
    private readonly openingHours: OpeningHoursService,
  ) {}

  async get({ from, to }: CalendarQuery): Promise<CalendarResponse> {
    const { startsAt } = warsawDayBounds(from);
    const { endsAt } = warsawDayBounds(to);
    const [staff, visits, absences, openingHours] = await Promise.all([
      this.staff(startsAt),
      this.visits(startsAt, endsAt),
      this.prisma.absence.findMany({
        where: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      }),
      this.openingHours.list(),
    ]);
    return {
      staff,
      visits,
      absences: absences.map(toAbsenceView),
      holidays: holidaysBetween(from, to),
      openingHours,
    };
  }

  /**
   * People who Przyjmują Wizyty, then the Usunięte osoby z Personelu until the day of
   * their last `SCHEDULED` Wizyta, which is `from` or later.
   */
  private async staff(from: Date): Promise<CalendarStaffMember[]> {
    const scheduledFrom = {
      state: 'SCHEDULED',
      startsAt: { gte: from },
    } satisfies Prisma.VisitWhereInput;
    const [current, deleted] = await Promise.all([
      this.prisma.staffMember.findMany({
        where: { deletedAt: null, acceptsVisits: true },
        orderBy: columnOrder,
      }),
      this.prisma.staffMember.findMany({
        where: { deletedAt: { not: null }, visits: { some: scheduledFrom } },
        include: {
          visits: {
            where: scheduledFrom,
            orderBy: { startsAt: 'desc' },
            take: 1,
            select: { startsAt: true },
          },
        },
        orderBy: columnOrder,
      }),
    ]);
    return [
      ...current.map(({ id, displayName }) => ({
        id,
        displayName,
        visibleUntil: null,
      })),
      ...deleted.map(({ id, displayName, visits }) => ({
        id,
        displayName,
        visibleUntil: warsawDate(visits[0].startsAt),
      })),
    ];
  }

  /**
   * `SCHEDULED` and `NO_SHOW` Wizyty whose time with the Przerwa overlaps the range.
   * The end is not a column, so the query takes those started up to the longest
   * Wizyta before and the overlap is checked here.
   */
  private async visits(startsAt: Date, endsAt: Date): Promise<CalendarVisit[]> {
    const visits = await this.prisma.visit.findMany({
      where: {
        state: { in: ['SCHEDULED', 'NO_SHOW'] },
        startsAt: {
          gt: new Date(startsAt.getTime() - LONGEST_VISIT_MS),
          lt: endsAt,
        },
      },
      include: calendarVisitInclude,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return visits
      .filter((visit) => visitInterval(visit).endsAt > startsAt)
      .map(toCalendarVisit);
  }
}

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ABSENCE_DEFAULT_LABEL,
  isVisitBreak,
  isVisitDuration,
  SERVICE_BREAK_MAX,
  SERVICE_DURATION_MAX,
  VISIT_BREAK_INVALID,
  VISIT_CLIENT_UNAVAILABLE,
  VISIT_COLLISION,
  VISIT_DESCRIPTION_REQUIRED,
  VISIT_DURATION_INVALID,
  VISIT_SERVICE_UNAVAILABLE,
  VISIT_STAFF_UNAVAILABLE,
  VISIT_STATE_CHANGE_INVALID,
  VisitChangeAction,
  VisitCollisionResponse,
  VisitState,
  VisitView,
} from '@bookit/shared';
import { ClsService } from 'nestjs-cls';
import { Service } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';
import {
  VisitChangeRecorder,
  VisitWithDetails,
  visitDetailsInclude,
} from '../visit-changes/visit-change-recorder';
import {
  findCollisions,
  Interval,
  MINUTE_MS,
  sameInterval,
  visitInterval,
} from './find-collisions';
import type { VisitChanges, VisitFields } from './visits.schemas';

type Db = Pick<
  PrismaService,
  | 'visit'
  | 'visitService'
  | 'staffMember'
  | 'client'
  | 'service'
  | 'absence'
  | 'visitChange'
>;

/** The longest a Wizyta can take up, to find the ones that started before an interval. */
const LONGEST_VISIT_MS = (SERVICE_DURATION_MAX + SERVICE_BREAK_MAX) * MINUTE_MS;

const toView = (visit: VisitWithDetails): VisitView => ({
  id: visit.id,
  staffMemberId: visit.staffMemberId,
  clientId: visit.clientId,
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
  createdById: visit.createdById,
  updatedById: visit.updatedById,
});

/** A copy of the Usługa as the Cennik has it now. */
const snapshot = (service: Service) => ({
  serviceId: service.id,
  nameSnapshot: service.name,
  priceGroszeSnapshot: service.priceGrosze,
  priceTypeSnapshot: service.priceType,
});

/** `422` for a Czas trwania or Przerwa out of range. */
function checkMinutes(durationMin?: number, breakMin?: number): void {
  if (durationMin !== undefined && !isVisitDuration(durationMin)) {
    throw new UnprocessableEntityException(VISIT_DURATION_INVALID);
  }
  if (breakMin !== undefined && !isVisitBreak(breakMin)) {
    throw new UnprocessableEntityException(VISIT_BREAK_INVALID);
  }
}

/** `422` for a Wizyta with no Usługi and no description. */
function checkDescribed(serviceCount: number, description: string | null) {
  if (serviceCount === 0 && description === null) {
    throw new UnprocessableEntityException(VISIT_DESCRIPTION_REQUIRED);
  }
}

/** Which Stan Wizyty each action starts from. */
const TRANSITIONS = {
  CANCELLED: ['SCHEDULED'],
  NO_SHOW: ['SCHEDULED'],
  SCHEDULED: ['CANCELLED', 'NO_SHOW'],
} satisfies Record<VisitState, VisitState[]>;

/** The Historia zmian entry of each move. */
const ACTIONS = {
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
  SCHEDULED: 'RESTORED',
} satisfies Record<VisitState, VisitChangeAction>;

/**
 * The Wizyty of the Salon from the context (#24). Queries are limited to that Salon by
 * the Prisma extension, so a person, Klient, Usługa or Wizyta of another Salon is not
 * found. A Kolizja warns with `409` unless the request accepts it. Each change writes
 * its Historia zmian entry in the same transaction (#25).
 */
@Injectable()
export class VisitsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
    @Inject(VisitChangeRecorder)
    private readonly changes: VisitChangeRecorder,
  ) {}

  async create(fields: VisitFields): Promise<VisitView> {
    const { acceptCollisions, serviceIds, ...rest } = fields;
    checkMinutes(rest.durationMin, rest.breakMin);
    checkDescribed(serviceIds.length, rest.description);
    return this.prisma.$transaction(async (tx) => {
      await this.checkStaffMember(tx, rest.staffMemberId);
      await this.checkClient(tx, rest.clientId);
      const services = await this.findServicesToAdd(tx, serviceIds);
      if (!acceptCollisions) {
        await this.checkCollisions(tx, visitInterval(rest));
      }
      const me = this.staffMemberId();
      const visit = await tx.visit.create({
        data: {
          ...rest,
          // The create input type requires it; the Salon filter checks it is the context's.
          salonId: this.salonId(),
          createdById: me,
          updatedById: me,
          services: { create: services.map(snapshot) },
        },
        include: visitDetailsInclude,
      });
      await this.changes.record(tx, visit.id, 'CREATED', null, visit);
      return toView(visit);
    });
  }

  /**
   * Usługi kept in `serviceIds` keep their snapshot, new ones get the current Cennik.
   * The person and the Klient are checked only when they change, so a Wizyta of a
   * deleted person can still be edited. Kolizje are checked when the time or the
   * person of a scheduled Wizyta changes.
   */
  async update(id: string, changes: VisitChanges): Promise<VisitView> {
    const { acceptCollisions, serviceIds, ...rest } = changes;
    checkMinutes(rest.durationMin, rest.breakMin);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.find(tx, id);
      if (
        rest.staffMemberId !== undefined &&
        rest.staffMemberId !== current.staffMemberId
      ) {
        await this.checkStaffMember(tx, rest.staffMemberId);
      }
      if (rest.clientId !== undefined && rest.clientId !== current.clientId) {
        await this.checkClient(tx, rest.clientId);
      }

      const currentIds = current.services.map((item) => item.serviceId);
      const nextIds = serviceIds ?? currentIds;
      const added = await this.findServicesToAdd(
        tx,
        nextIds.filter((serviceId) => !currentIds.includes(serviceId)),
      );
      checkDescribed(
        nextIds.length,
        rest.description !== undefined ? rest.description : current.description,
      );

      const after = visitInterval({ ...current, ...rest });
      const moved = !sameInterval(after, visitInterval(current));
      if (moved && current.state === 'SCHEDULED' && !acceptCollisions) {
        await this.checkCollisions(tx, after, id);
      }

      await tx.visitService.deleteMany({
        where: { visitId: id, serviceId: { notIn: nextIds } },
      });
      const visit = await tx.visit.update({
        where: { id },
        data: {
          ...rest,
          updatedById: this.staffMemberId(),
          services: { create: added.map(snapshot) },
        },
        include: visitDetailsInclude,
      });
      await this.changes.record(tx, id, 'UPDATED', current, visit);
      return toView(visit);
    });
  }

  /**
   * Moves the Wizyta to `state`, or `422` when its Stan Wizyty does not allow it.
   * Restoring checks the person, the Klient and Kolizje, as for a new Wizyta: the time
   * may have been taken meanwhile.
   */
  async changeState(
    id: string,
    state: VisitState,
    acceptCollisions = false,
  ): Promise<VisitView> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.find(tx, id);
      const from: readonly VisitState[] = TRANSITIONS[state];
      if (!from.includes(current.state)) {
        throw new UnprocessableEntityException(VISIT_STATE_CHANGE_INVALID);
      }
      if (state === 'SCHEDULED') {
        // Like a new Wizyta: a deleted person or Klient has no scheduled Wizyty.
        await this.checkStaffMember(tx, current.staffMemberId);
        await this.checkClient(tx, current.clientId);
        if (!acceptCollisions) {
          await this.checkCollisions(tx, visitInterval(current), id);
        }
      }
      const visit = await tx.visit.update({
        where: { id },
        data: { state, updatedById: this.staffMemberId() },
        include: visitDetailsInclude,
      });
      await this.changes.record(tx, id, ACTIONS[state], current, visit);
      return toView(visit);
    });
  }

  /** A mistake when entering: the Wizyta goes for good, with its Usługi. */
  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.find(tx, id);
      await tx.visit.delete({ where: { id } });
      await this.changes.record(tx, id, 'DELETED', current, null);
    });
  }

  /** `404` for a Wizyta of another Salon. */
  private async find(db: Db, id: string): Promise<VisitWithDetails> {
    const visit = await db.visit.findFirst({
      where: { id },
      include: visitDetailsInclude,
    });
    if (!visit) throw new NotFoundException();
    return visit;
  }

  /** `422` unless the person is in the Salon, not deleted and accepts Wizyty. */
  private async checkStaffMember(db: Db, id: string): Promise<void> {
    const staffMember = await db.staffMember.findFirst({
      where: { id, deletedAt: null, acceptsVisits: true },
    });
    if (!staffMember) {
      throw new UnprocessableEntityException(VISIT_STAFF_UNAVAILABLE);
    }
  }

  /** `422` for a Klient of another Salon or a deleted one. */
  private async checkClient(db: Db, id: string): Promise<void> {
    const client = await db.client.findFirst({
      where: { id, deletedAt: null },
    });
    if (!client) {
      throw new UnprocessableEntityException(VISIT_CLIENT_UNAVAILABLE);
    }
  }

  /** The Usługi to add, or `422` if one is in another Salon or archived. */
  private async findServicesToAdd(db: Db, ids: string[]): Promise<Service[]> {
    if (ids.length === 0) return [];
    const services = await db.service.findMany({
      where: { id: { in: ids }, archivedAt: null },
    });
    if (services.length !== ids.length) {
      throw new UnprocessableEntityException(VISIT_SERVICE_UNAVAILABLE);
    }
    return services;
  }

  /** `409` listing the Wizyty and Nieobecności `interval` overlaps. */
  private async checkCollisions(
    db: Db,
    interval: Interval,
    exceptVisitId?: string,
  ): Promise<void> {
    const { staffMemberId, startsAt, endsAt } = interval;
    const [visits, absences] = await Promise.all([
      db.visit.findMany({
        where: {
          staffMemberId,
          state: 'SCHEDULED',
          startsAt: {
            gt: new Date(startsAt.getTime() - LONGEST_VISIT_MS),
            lt: endsAt,
          },
          ...(exceptVisitId && { id: { not: exceptVisitId } }),
        },
        include: { client: { select: { name: true } } },
      }),
      db.absence.findMany({
        where: {
          staffMemberId,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      }),
    ]);
    const collisions = findCollisions(
      interval,
      visits.map((visit) => ({ ...visit, label: visit.client.name })),
      absences.map((absence) => ({
        ...absence,
        label: absence.reason || ABSENCE_DEFAULT_LABEL,
      })),
    );
    if (collisions.length === 0) return;
    const body: VisitCollisionResponse = {
      statusCode: 409,
      error: 'Conflict',
      message: VISIT_COLLISION,
      collisions: collisions.map((collision) => ({
        ...collision,
        startsAt: collision.startsAt.toISOString(),
        endsAt: collision.endsAt.toISOString(),
      })),
    };
    throw new ConflictException(body);
  }

  private salonId(): string {
    const salonId = this.cls.get('salonId');
    if (!salonId) throw new Error('VisitsService needs a Salon context');
    return salonId;
  }

  /** The person making the change: `createdById` and `updatedById`. */
  private staffMemberId(): string {
    const staffMemberId = this.cls.get('staffMemberId');
    if (!staffMemberId) {
      throw new Error('VisitsService needs a person in the Salon context');
    }
    return staffMemberId;
  }
}

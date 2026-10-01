import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ABSENCE_ENDS_BEFORE_START,
  ABSENCE_STAFF_UNAVAILABLE,
  AbsenceView,
} from '@bookit/shared';
import { ClsService } from 'nestjs-cls';
import { Absence } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';
import type { AbsenceChanges, AbsenceFields } from './absences.schemas';

type Db = Pick<PrismaService, 'absence' | 'staffMember'>;

export const toAbsenceView = (absence: Absence): AbsenceView => ({
  id: absence.id,
  staffMemberId: absence.staffMemberId,
  startsAt: absence.startsAt.toISOString(),
  endsAt: absence.endsAt.toISOString(),
  reason: absence.reason,
});

/** `422` unless the Nieobecność ends after it starts. */
function checkOrder(startsAt: Date, endsAt: Date): void {
  if (endsAt <= startsAt) {
    throw new UnprocessableEntityException(ABSENCE_ENDS_BEFORE_START);
  }
}

/**
 * The Nieobecności of the Salon from the context (#26). Queries are limited to that
 * Salon by the Prisma extension, so a person or Nieobecność of another Salon is not
 * found. The API takes any instants: whole days come from `warsawDayBounds` in the form.
 */
@Injectable()
export class AbsencesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
  ) {}

  async create(fields: AbsenceFields): Promise<AbsenceView> {
    checkOrder(fields.startsAt, fields.endsAt);
    return this.prisma.$transaction(async (tx) => {
      await this.checkStaffMember(tx, fields.staffMemberId);
      const absence = await tx.absence.create({
        // The create input type requires it; the Salon filter checks it is the context's.
        data: { ...fields, salonId: this.salonId() },
      });
      return toAbsenceView(absence);
    });
  }

  /** The person is checked only when it changes, like for a Wizyta. */
  async update(id: string, changes: AbsenceChanges): Promise<AbsenceView> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.find(tx, id);
      checkOrder(
        changes.startsAt ?? current.startsAt,
        changes.endsAt ?? current.endsAt,
      );
      if (
        changes.staffMemberId !== undefined &&
        changes.staffMemberId !== current.staffMemberId
      ) {
        await this.checkStaffMember(tx, changes.staffMemberId);
      }
      const absence = await tx.absence.update({
        where: { id },
        data: changes,
      });
      return toAbsenceView(absence);
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.find(tx, id);
      await tx.absence.delete({ where: { id } });
    });
  }

  /** `404` for a Nieobecność of another Salon. */
  private async find(db: Db, id: string): Promise<Absence> {
    const absence = await db.absence.findFirst({ where: { id } });
    if (!absence) throw new NotFoundException();
    return absence;
  }

  /** `422` unless the person is in the Salon and not deleted. */
  private async checkStaffMember(db: Db, id: string): Promise<void> {
    const staffMember = await db.staffMember.findFirst({
      where: { id, deletedAt: null },
    });
    if (!staffMember) {
      throw new UnprocessableEntityException(ABSENCE_STAFF_UNAVAILABLE);
    }
  }

  private salonId(): string {
    const salonId = this.cls.get('salonId');
    if (!salonId) throw new Error('AbsencesService needs a Salon context');
    return salonId;
  }
}

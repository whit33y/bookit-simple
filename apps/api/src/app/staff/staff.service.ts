import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  InvitationStatus,
  LAST_OWNER,
  STAFF_EMAIL_TAKEN,
  STAFF_INVITATION_ACCEPTED,
  STAFF_ORDER_MISMATCH,
  STAFF_DELETE_SELF,
  STAFF_PHOTO_NOT_FOUND,
  StaffDeletionPreview,
  StaffMemberView,
} from '@bookit/shared';
import { ClsService } from 'nestjs-cls';
import { Prisma, StaffRole } from '../../generated/prisma/client';
import { InvitationService } from '../invitations/invitation.service';
import { PhotosService } from '../photos/photos.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';

/** A person to invite, already validated and normalized by the controller. */
export interface NewStaffMember {
  displayName: string;
  /** Lowercased */
  email: string;
  role: StaffRole;
}

/** Changes from `PATCH /api/staff/:id`; a missing field stays as it is. */
export interface StaffMemberChanges {
  displayName?: string;
  role?: StaffRole;
  acceptsVisits?: boolean;
  showOnPage?: boolean;
  photoId?: string | null;
  bio?: string | null;
}

/** `409` when two changes to the Właściciele race and one has to give way. */
export const STAFF_CHANGE_CONFLICT =
  'Ktoś właśnie zmienił Personel. Odśwież stronę i spróbuj ponownie';

/** The account, and the newest invitation not used yet, for the invitation status. */
const withInvitation = {
  user: true,
  invitations: {
    where: { usedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
} as const satisfies Prisma.StaffMemberInclude;

type StaffMemberWithInvitation = Prisma.StaffMemberGetPayload<{
  include: typeof withInvitation;
}>;

function invitationStatus(member: StaffMemberWithInvitation): InvitationStatus {
  if (member.user?.passwordHash) return 'ACCEPTED';
  const invitation = member.invitations[0];
  return invitation && invitation.expiresAt > new Date()
    ? 'PENDING'
    : 'EXPIRED';
}

function toView(member: StaffMemberWithInvitation): StaffMemberView {
  return {
    id: member.id,
    displayName: member.displayName,
    email: member.user?.email ?? null,
    role: member.role,
    invitation: invitationStatus(member),
    acceptsVisits: member.acceptsVisits,
    showOnPage: member.showOnPage,
    photoId: member.photoId,
    bio: member.bio,
  };
}

const isPrismaError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

/** What a change to the Personel touches inside its transaction. */
type StaffTx = Pick<
  PrismaService,
  | 'staffMember'
  | 'visit'
  | 'visitChange'
  | 'absence'
  | 'invitation'
  | 'user'
  | 'photo'
>;

/**
 * Deletes the Photo row in the transaction and gives its file's key, to delete after
 * the commit. `null` when there is no Photo.
 */
async function dropPhoto(
  tx: Pick<PrismaService, 'photo'>,
  photoId: string | null,
): Promise<string | null> {
  if (!photoId) return null;
  const photo = await tx.photo.findUnique({ where: { id: photoId } });
  if (!photo) return null;
  await tx.photo.delete({ where: { id: photoId } });
  return photo.storageKey;
}

/** `422` unless the Salon has a Właściciel other than `id`. */
async function assertAnotherOwner(
  tx: Pick<PrismaService, 'staffMember'>,
  id: string,
): Promise<void> {
  const otherOwners = await tx.staffMember.count({
    where: { role: 'OWNER', deletedAt: null, id: { not: id } },
  });
  if (otherOwners === 0) throw new UnprocessableEntityException(LAST_OWNER);
}

/** Sending the invitation happens inside the transaction, and SMTP can be slow. */
const INVITE_TIMEOUT_MS = 15_000;

/**
 * The Personel of the Salon from the context (#14). Queries are limited to that Salon
 * by the Prisma extension; people removed from the Personel are left out everywhere.
 */
@Injectable()
export class StaffService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InvitationService) private readonly invitations: InvitationService,
    @Inject(PhotosService) private readonly photos: PhotosService,
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
  ) {}

  /** In the Salon's order; people added at the same position by creation. */
  async list(): Promise<StaffMemberView[]> {
    const members = await this.prisma.staffMember.findMany({
      where: { deletedAt: null },
      include: withInvitation,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return members.map(toView);
  }

  /**
   * In one transaction: the account without a password, the person at the end of the
   * list, and the invitation e-mail. If the e-mail fails, nothing stays.
   * `409` for an e-mail that already has an account.
   */
  async invite(input: NewStaffMember): Promise<StaffMemberView> {
    await this.assertEmailFree(input.email);
    let id: string;
    try {
      id = await this.prisma.$transaction(
        async (tx) => {
          const last = await tx.staffMember.aggregate({
            where: { deletedAt: null },
            _max: { sortOrder: true },
          });
          const user = await tx.user.create({ data: { email: input.email } });
          const member = await tx.staffMember.create({
            data: {
              // The create input type requires it; the Salon filter checks it is the context's.
              salonId: this.salonId(),
              userId: user.id,
              role: input.role,
              displayName: input.displayName,
              sortOrder: (last._max.sortOrder ?? -1) + 1,
            },
          });
          await this.invitations.createFor(member.id, tx);
          return member.id;
        },
        { timeout: INVITE_TIMEOUT_MS },
      );
    } catch (error) {
      // Another request took the e-mail after the check above.
      if (isPrismaError(error, 'P2002'))
        await this.assertEmailFree(input.email);
      throw error;
    }
    return toView(await this.find(id));
  }

  /**
   * `404` for a person outside the Personel, `400` for a photo the Salon does not have,
   * `422` when the last Właściciel would lose the role. A new `photoId`, or `null`,
   * deletes the old Zdjęcie profilowe with its file. Serializable, so two Właściciele
   * giving up the role at once cannot both succeed.
   */
  async update(
    id: string,
    changes: StaffMemberChanges,
  ): Promise<StaffMemberView> {
    if (changes.photoId) await this.assertPhotoExists(changes.photoId);
    const oldFile = await this.changeOwners(async (tx) => {
      const member = await tx.staffMember.findFirst({
        where: { id, deletedAt: null },
      });
      if (!member) throw new NotFoundException();
      if (member.role === 'OWNER' && changes.role === 'EMPLOYEE') {
        await assertAnotherOwner(tx, id);
      }
      await tx.staffMember.update({ where: { id }, data: changes });
      const photoChanged =
        changes.photoId !== undefined && changes.photoId !== member.photoId;
      return photoChanged ? dropPhoto(tx, member.photoId) : null;
    });
    if (oldFile) await this.photos.deleteFile(oldFile);
    return toView(await this.find(id));
  }

  /** `ids` must name every person of the Personel exactly once, else `400`. */
  async reorder(ids: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const members = await tx.staffMember.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      const current = new Set(members.map((m) => m.id));
      const exact =
        ids.length === current.size &&
        new Set(ids).size === ids.length &&
        ids.every((id) => current.has(id));
      if (!exact) throw new BadRequestException(STAFF_ORDER_MISMATCH);
      for (const [sortOrder, id] of ids.entries()) {
        await tx.staffMember.update({ where: { id }, data: { sortOrder } });
      }
    });
  }

  /** A new link, the previous one stops working. `409` once the person has set the password. */
  async resendInvitation(id: string): Promise<void> {
    const member = await this.find(id);
    if (!member.user) throw new NotFoundException();
    if (member.user.passwordHash !== null) {
      throw new ConflictException(STAFF_INVITATION_ACCEPTED);
    }
    await this.invitations.createFor(member.id);
  }

  /** What removing the person touches: Wizyty before and from now, and the last scheduled one. */
  async deletionPreview(id: string): Promise<StaffDeletionPreview> {
    await this.find(id);
    const now = new Date();
    const [pastVisits, futureVisits, lastScheduled] = await Promise.all([
      this.prisma.visit.count({
        where: { staffMemberId: id, startsAt: { lt: now } },
      }),
      this.prisma.visit.count({
        where: { staffMemberId: id, startsAt: { gte: now } },
      }),
      this.prisma.visit.findFirst({
        where: { staffMemberId: id, state: 'SCHEDULED' },
        orderBy: { startsAt: 'desc' },
        select: { startsAt: true },
      }),
    ]);
    return {
      pastVisits,
      futureVisits,
      lastScheduledVisitAt: lastScheduled?.startsAt.toISOString() ?? null,
    };
  }

  /**
   * Makes the person an Usunięta osoba z Personelu: the account goes with its sessions
   * and invitations, the Zdjęcie profilowe with its file, only `displayName` stays.
   * Without `keepVisits` her Wizyty, their Historia zmian and her Nieobecności go too.
   * `404` for a person outside the Personel, `422` for the caller or the last
   * Właściciel. Serializable, like `update`.
   */
  async remove(id: string, keepVisits: boolean): Promise<void> {
    if (id === this.cls.get('staffMemberId')) {
      throw new UnprocessableEntityException(STAFF_DELETE_SELF);
    }
    const photoFile = await this.changeOwners(async (tx) => {
      const member = await tx.staffMember.findFirst({
        where: { id, deletedAt: null },
      });
      if (!member) throw new NotFoundException();
      if (member.role === 'OWNER') await assertAnotherOwner(tx, id);
      if (!keepVisits) {
        const visits = await tx.visit.findMany({
          where: { staffMemberId: id },
          select: { id: true },
        });
        const visitIds = visits.map((visit) => visit.id);
        await tx.visitChange.deleteMany({
          where: { visitId: { in: visitIds } },
        });
        await tx.visit.deleteMany({ where: { id: { in: visitIds } } });
        await tx.absence.deleteMany({ where: { staffMemberId: id } });
      }
      await tx.invitation.deleteMany({ where: { staffMemberId: id } });
      await tx.staffMember.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          userId: null,
          photoId: null,
          bio: null,
          showOnPage: false,
        },
      });
      // Sessions and password resets go with the account.
      if (member.userId) {
        await tx.user.delete({ where: { id: member.userId } });
      }
      return dropPhoto(tx, member.photoId);
    });
    if (photoFile) await this.photos.deleteFile(photoFile);
  }

  /**
   * A change that may take away a Właściciel. Serializable, so two such changes at once
   * cannot both leave the Salon without one; the one that gives way answers `409`.
   */
  private async changeOwners<T>(
    change: (tx: StaffTx) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(change, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (isPrismaError(error, 'P2034')) {
        throw new ConflictException(STAFF_CHANGE_CONFLICT);
      }
      throw error;
    }
  }

  private async find(id: string): Promise<StaffMemberWithInvitation> {
    const member = await this.prisma.staffMember.findFirst({
      where: { id, deletedAt: null },
      include: withInvitation,
    });
    if (!member) throw new NotFoundException();
    return member;
  }

  /** In the MVP one person belongs to one Salon, so any existing account is a conflict. */
  private async assertEmailFree(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) throw new ConflictException(STAFF_EMAIL_TAKEN);
  }

  /** The Salon filter hides photos of other Salons. */
  private async assertPhotoExists(photoId: string): Promise<void> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
    });
    if (!photo) throw new BadRequestException(STAFF_PHOTO_NOT_FOUND);
  }

  private salonId(): string {
    const salonId = this.cls.get('salonId');
    if (!salonId) throw new Error('StaffService needs a Salon context');
    return salonId;
  }
}

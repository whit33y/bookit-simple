import {
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvitationResponse } from '@bookit/shared';
import { hash } from 'argon2';
import { ClsService } from 'nestjs-cls';
import { createHash, randomBytes } from 'node:crypto';
import { MailService } from '../../mail/mail.service';
import { invitationEmail } from '../../mail/templates/invitation';
import { assertSalonActive, SessionIdentity } from '../auth/auth.service';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** One message for an unknown, used, expired or replaced invitation. */
export const INVITATION_GONE = 'Zaproszenie wygasło albo zostało już użyte';
/** Who invites, in the e-mail to a Właściciel. */
const ADMINISTRATOR_NAME = 'Administrator Bookit';

/** Only this goes to the database; the token itself is only in the e-mail. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Invitations to the Personel: the Administrator invites a Właściciel (#11), a
 * Właściciel invites Pracownicy (#14). The invited person sets the password from the link.
 */
@Injectable()
export class InvitationService {
  private readonly appUrl: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true }).replace(/\/+$/, '');
  }

  /**
   * E-mails the person a link valid 7 days and then drops their previous pending
   * invitation. Who invites comes from the Salon context: the Administrator or the
   * person from the Personel making the request. `404` for a person outside that Salon.
   */
  async createFor(staffMemberId: string): Promise<void> {
    const staffMember = await this.prisma.staffMember.findFirst({
      where: { id: staffMemberId, deletedAt: null },
      include: { user: true, salon: true },
    });
    if (!staffMember?.user) throw new NotFoundException();
    const inviterName = await this.inviterName();

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const { id } = await this.prisma.invitation.create({
      data: { staffMemberId, tokenHash: hashToken(token), expiresAt },
    });
    await this.mail.send({
      to: staffMember.user.email,
      ...invitationEmail({
        salonName: staffMember.salon.name,
        inviterName,
        link: `${this.appUrl}/zaproszenie/${token}`,
        expiresAt,
      }),
    });
    // Only after the e-mail went out, so a failed send leaves the previous link working.
    await this.prisma.invitation.deleteMany({
      where: { staffMemberId, usedAt: null, id: { not: id } },
    });
  }

  /** What the screen for setting the password shows. `410` unless the token can be used. */
  async describe(token: string): Promise<InvitationResponse> {
    const { staffMember } = await this.findUsable(token);
    return {
      salonName: staffMember.salon.name,
      displayName: staffMember.displayName,
    };
  }

  /**
   * Sets the password and uses the invitation up, once: of two requests racing with
   * one token, the second gets `410`. Returns who to log in.
   */
  async accept(token: string, password: string): Promise<SessionIdentity> {
    const { invitation, staffMember, user } = await this.findUsable(token);
    assertSalonActive(staffMember.salon);
    const passwordHash = await hash(password);

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.invitation.updateMany({
        where: { id: invitation.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (count === 0) throw new GoneException(INVITATION_GONE);
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    });
    return { userId: user.id, staffMemberId: staffMember.id };
  }

  /**
   * Runs without a Salon context (see `AuthModule`), so the Salon filter does not hide
   * the invitation, and the nested StaffMember read is not filtered either.
   */
  private async findUsable(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { staffMember: { include: { salon: true, user: true } } },
    });
    const { staffMember } = invitation ?? {};
    const usable =
      invitation &&
      !invitation.usedAt &&
      invitation.expiresAt > new Date() &&
      !staffMember?.deletedAt;
    if (!usable || !staffMember?.user) {
      throw new GoneException(INVITATION_GONE);
    }
    return { invitation, staffMember, user: staffMember.user };
  }

  private async inviterName(): Promise<string> {
    if (this.cls.get('isAdministrator')) return ADMINISTRATOR_NAME;
    const id = this.cls.get('staffMemberId');
    if (!id) {
      throw new Error(
        'createFor needs the Administrator or a person from the Personel in the Salon context',
      );
    }
    const inviter = await this.prisma.staffMember.findUniqueOrThrow({
      where: { id },
    });
    return inviter.displayName;
  }
}

import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { MeResponse } from '@bookit/shared';
import { hash, verify } from 'argon2';
import { SalonStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../salon-context/salon-context.guard';

/** One message for every bad e-mail and password pair, so it does not tell which one is wrong. */
export const BAD_CREDENTIALS = 'Nieprawidłowy e-mail lub hasło';
export const SALON_SUSPENDED = 'Salon jest zawieszony';

/** E-mails are stored trimmed and lowercased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertSalonActive(salon?: { status: SalonStatus }): void {
  if (salon?.status === 'SUSPENDED') {
    throw new ForbiddenException(SALON_SUSPENDED);
  }
}

/** What the session keeps about the logged-in person. */
export interface SessionIdentity {
  userId: string;
  staffMemberId?: string;
}

const staffMemberWithSalon = {
  where: { deletedAt: null },
  include: { salon: true },
  orderBy: { createdAt: 'asc' },
  take: 1,
} as const;

@Injectable()
export class AuthService {
  /** Verified against for an unknown e-mail, so the reply takes as long as for a wrong password. */
  private dummyHash?: Promise<string>;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async login(email: string, password: string): Promise<SessionIdentity> {
    // StaffMember is covered by Salon isolation; loaded nested under User it is not
    // filtered, which is what login needs: there is no Salon context yet.
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      include: { staffMembers: staffMemberWithSalon },
    });
    const valid = await verify(
      user?.passwordHash ?? (await this.getDummyHash()),
      password,
    );
    const staffMember = user?.staffMembers[0];
    if (!user?.passwordHash || !valid) {
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }
    if (!staffMember && !user.isAdministrator) {
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }
    assertSalonActive(staffMember?.salon);
    return { userId: user.id, staffMemberId: staffMember?.id };
  }

  /**
   * The person behind a session, checked on every request. `null` when the account or
   * the place in the Personel is gone; throws `403` when the Salon is suspended.
   */
  async authenticate(
    identity: SessionIdentity,
  ): Promise<AuthenticatedUser | null> {
    const me = await this.findMe(identity);
    if (!me) return null;
    return {
      userId: me.user.id,
      isAdministrator: me.user.isAdministrator,
      salonId: me.salon?.id,
      staffMemberId: me.staffMember?.id,
      role: me.role ?? undefined,
    };
  }

  async me(identity: SessionIdentity): Promise<MeResponse> {
    const me = await this.findMe(identity);
    if (!me) throw new UnauthorizedException();
    return me;
  }

  private async findMe({
    userId,
    staffMemberId,
  }: SessionIdentity): Promise<MeResponse | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        staffMembers: {
          // `in: []` for the Administrator, who has no place in the Personel.
          where: {
            id: { in: staffMemberId ? [staffMemberId] : [] },
            deletedAt: null,
          },
          include: { salon: true },
        },
      },
    });
    if (!user) return null;
    const staffMember = user.staffMembers[0];
    if (staffMemberId && !staffMember) return null;
    assertSalonActive(staffMember?.salon);
    return {
      user: {
        id: user.id,
        email: user.email,
        isAdministrator: user.isAdministrator,
      },
      staffMember: staffMember
        ? { id: staffMember.id, displayName: staffMember.displayName }
        : null,
      salon: staffMember
        ? {
            id: staffMember.salon.id,
            name: staffMember.salon.name,
            slug: staffMember.salon.slug,
          }
        : null,
      role: staffMember?.role ?? null,
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hash('bookit-dummy-password');
    return this.dummyHash;
  }
}

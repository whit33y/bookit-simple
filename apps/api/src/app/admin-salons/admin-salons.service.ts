import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addressLine,
  AdminSalonDetails,
  AdminSalonSummary,
  ALL_PAGE_SECTIONS,
  CreateSalonResponse,
  DEFAULT_ACCENT_COLOR,
  INVITATION_ALREADY_ACCEPTED,
  OWNER_EMAIL_TAKEN,
  RESEND_SALON_SUSPENDED,
  privacyNoticeTemplate,
  SLUG_ERROR_MESSAGES,
  SlugAvailabilityResponse,
  validateSlug,
} from '@bookit/shared';
import { Prisma, SalonStatus } from '../../generated/prisma/client';
import { SessionService } from '../auth/session.service';
import { InvitationService } from '../invitations/invitation.service';
import { PrismaService } from '../prisma/prisma.service';

/** A new Salon, already validated and normalized by the controller. */
export interface NewSalon {
  name: string;
  slug: string;
  ownerName: string;
  /** Lowercased */
  ownerEmail: string;
  /** E.164 */
  phone: string | null;
  email: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
}

/** The Właściciel still in the Personel; the first one, should there ever be more. */
const withOwner = {
  staffMembers: {
    where: { role: 'OWNER', deletedAt: null },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
    take: 1,
  },
} as const satisfies Prisma.SalonInclude;

type SalonWithOwner = Prisma.SalonGetPayload<{ include: typeof withOwner }>;

function toSummary(salon: SalonWithOwner): AdminSalonSummary {
  const owner = salon.staffMembers[0];
  return {
    id: salon.id,
    name: salon.name,
    slug: salon.slug,
    status: salon.status,
    createdAt: salon.createdAt.toISOString(),
    owner: owner?.user
      ? {
          displayName: owner.displayName,
          email: owner.user.email,
          invitationAccepted: owner.user.passwordHash !== null,
        }
      : null,
  };
}

function toDetails(salon: SalonWithOwner): AdminSalonDetails {
  return {
    ...toSummary(salon),
    phone: salon.phone,
    email: salon.email,
    street: salon.street,
    postalCode: salon.postalCode,
    city: salon.city,
  };
}

/** Sending the invitation happens inside the transaction, and SMTP can be slow. */
const CREATE_TIMEOUT_MS = 15_000;

/** Salons as the Administrator manages them. Runs under `@AdminScope()`. */
@Injectable()
export class AdminSalonsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InvitationService) private readonly invitations: InvitationService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  /** Every Salon, newest first. Few enough in the MVP to search in the browser. */
  async list(): Promise<AdminSalonSummary[]> {
    const salons = await this.prisma.salon.findMany({
      include: withOwner,
      orderBy: { createdAt: 'desc' },
    });
    return salons.map(toSummary);
  }

  /** `404` for an unknown Salon. */
  async details(id: string): Promise<AdminSalonDetails> {
    return toDetails(await this.find(id));
  }

  /**
   * The Personel cannot log in, and whoever is logged in loses the session.
   * The status goes first, so a request racing the logout already gets `403`.
   */
  async suspend(id: string): Promise<AdminSalonDetails> {
    const salon = await this.setStatus(id, 'SUSPENDED');
    await this.sessions.destroyAllForSalon(id);
    return salon;
  }

  async resume(id: string): Promise<AdminSalonDetails> {
    return this.setStatus(id, 'ACTIVE');
  }

  /**
   * A new link for a Właściciel who has not set the password; the previous one stops
   * working. `409` once they have, or while the Salon is suspended, since the link
   * would not let them in.
   */
  async resendInvitation(id: string): Promise<void> {
    const salon = await this.find(id);
    const owner = salon.staffMembers[0];
    if (!owner?.user) throw new NotFoundException();
    if (owner.user.passwordHash !== null) {
      throw new ConflictException(INVITATION_ALREADY_ACCEPTED);
    }
    if (salon.status === 'SUSPENDED') {
      throw new ConflictException(RESEND_SALON_SUSPENDED);
    }
    await this.invitations.createFor(owner.id);
  }

  private async find(id: string): Promise<SalonWithOwner> {
    const salon = await this.prisma.salon.findUnique({
      where: { id },
      include: withOwner,
    });
    if (!salon) throw new NotFoundException();
    return salon;
  }

  private async setStatus(
    id: string,
    status: SalonStatus,
  ): Promise<AdminSalonDetails> {
    try {
      const salon = await this.prisma.salon.update({
        where: { id },
        data: { status },
        include: withOwner,
      });
      return toDetails(salon);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException();
      }
      throw error;
    }
  }

  /** Checks the form of the address, then whether a Salon has it now or had it before. */
  async slugAvailability(slug: string): Promise<SlugAvailabilityResponse> {
    const reason =
      validateSlug(slug) ?? ((await this.slugTaken(slug)) ? 'TAKEN' : null);
    return { available: reason === null, reason };
  }

  /**
   * In one transaction: the Salon with its Wizytówka defaults, the Właściciel's account
   * without a password, the Właściciel in the Personel, and the invitation e-mail.
   * If the e-mail fails, nothing stays. `409` for a taken address or e-mail.
   */
  async create(input: NewSalon): Promise<CreateSalonResponse> {
    await this.assertFree(input);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const salon = await tx.salon.create({
            data: {
              name: input.name,
              slug: input.slug,
              phone: input.phone,
              email: input.email,
              street: input.street,
              postalCode: input.postalCode,
              city: input.city,
              sections: { ...ALL_PAGE_SECTIONS },
              accentColor: DEFAULT_ACCENT_COLOR,
              privacyNotice: privacyNoticeTemplate({
                salonName: input.name,
                address: addressLine(input),
                email: input.email,
              }),
            },
          });
          const user = await tx.user.create({
            data: { email: input.ownerEmail },
          });
          const owner = await tx.staffMember.create({
            data: {
              salonId: salon.id,
              userId: user.id,
              role: 'OWNER',
              displayName: input.ownerName,
              acceptsVisits: true,
            },
          });
          await this.invitations.createFor(owner.id, tx);
          return { id: salon.id, slug: salon.slug };
        },
        { timeout: CREATE_TIMEOUT_MS },
      );
    } catch (error) {
      // Another request took the address or the e-mail after the check above.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        await this.assertFree(input);
      }
      throw error;
    }
  }

  private async assertFree({ slug, ownerEmail }: NewSalon): Promise<void> {
    if (await this.slugTaken(slug)) {
      throw new ConflictException(SLUG_ERROR_MESSAGES.TAKEN);
    }
    // In the MVP one person belongs to one Salon, so any existing account is a conflict.
    const user = await this.prisma.user.findUnique({
      where: { email: ownerEmail },
    });
    if (user) throw new ConflictException(OWNER_EMAIL_TAKEN);
  }

  /** An old address keeps redirecting to its Salon (#13), so no one else can take it. */
  private async slugTaken(slug: string): Promise<boolean> {
    const [salons, redirects] = await Promise.all([
      this.prisma.salon.count({ where: { slug } }),
      this.prisma.salonSlugRedirect.count({ where: { oldSlug: slug } }),
    ]);
    return salons + redirects > 0;
  }
}

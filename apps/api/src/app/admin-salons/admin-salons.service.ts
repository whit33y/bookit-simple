import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  addressLine,
  ALL_PAGE_SECTIONS,
  CreateSalonResponse,
  DEFAULT_ACCENT_COLOR,
  OWNER_EMAIL_TAKEN,
  privacyNoticeTemplate,
  SLUG_ERROR_MESSAGES,
  SlugAvailabilityResponse,
  validateSlug,
} from '@bookit/shared';
import { Prisma } from '../../generated/prisma/client';
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

/** Sending the invitation happens inside the transaction, and SMTP can be slow. */
const CREATE_TIMEOUT_MS = 15_000;

/** Salons as the Administrator manages them. Runs under `@AdminScope()`. */
@Injectable()
export class AdminSalonsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InvitationService) private readonly invitations: InvitationService,
  ) {}

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

import { Inject, Injectable } from '@nestjs/common';
import { validateSlug } from '@bookit/shared';
import { Salon } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Where a request for a Wizytówka came in. */
export interface PageLocation {
  /** Unused until the subdomain and own domain (ADR 0002). */
  host: string;
  /** e.g. `/studio-kora/prywatnosc` */
  path: string;
}

/** The Salon at that address, or its current Adres wizytówki when the address is an old one. */
export type ResolvedSalon = { salon: Salon } | { redirectTo: string };

/**
 * The one function `(host, path) -> Salon` from ADR 0002. Today it reads only the first
 * segment of the path; a subdomain or own domain is added here, without changes elsewhere.
 * Runs across Salons, so the caller needs `@AdminScope()`.
 */
@Injectable()
export class SalonResolver {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `null` for an unknown address and for a suspended Salon. */
  async resolve({ path }: PageLocation): Promise<ResolvedSalon | null> {
    const [pathname] = path.split(/[?#]/);
    const slug = pathname.split('/').find(Boolean) ?? '';
    if (validateSlug(slug)) return null;

    const salon = await this.prisma.salon.findUnique({ where: { slug } });
    if (salon) return salon.status === 'ACTIVE' ? { salon } : null;

    const redirect = await this.prisma.salonSlugRedirect.findUnique({
      where: { oldSlug: slug },
      include: { salon: { select: { slug: true, status: true } } },
    });
    return redirect?.salon.status === 'ACTIVE'
      ? { redirectTo: redirect.salon.slug }
      : null;
  }
}

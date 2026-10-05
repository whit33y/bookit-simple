import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DEFAULT_ACCENT_COLOR,
  pageSections,
  pageHeaderLayout,
  SALON_PHOTO_NOT_FOUND,
  SalonPageSettings,
} from '@bookit/shared';
import { ClsService } from 'nestjs-cls';
import { Salon } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';
import { SalonPageChanges } from './salon-page.schema';

const toSettings = (salon: Salon): SalonPageSettings => ({
  name: salon.name,
  slug: salon.slug,
  about: salon.about,
  street: salon.street,
  postalCode: salon.postalCode,
  city: salon.city,
  phone: salon.phone,
  email: salon.email,
  mapUrl: salon.mapUrl,
  headerLayout: pageHeaderLayout(salon.headerLayout),
  accentColor: salon.accentColor ?? DEFAULT_ACCENT_COLOR,
  logoPhotoId: salon.logoPhotoId,
  heroPhotoId: salon.heroPhotoId,
  sections: pageSections(salon.sections),
  privacyNotice: salon.privacyNotice,
});

/**
 * The content of the Wizytówka of the Salon from the context (#20). Queries are limited
 * to that Salon by the Prisma extension, so a Photo of another Salon is not found.
 */
@Injectable()
export class SalonPageService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
  ) {}

  async get(): Promise<SalonPageSettings> {
    return toSettings(await this.salon());
  }

  /** `sections` names only the sections that change; the rest keep their state. */
  async update(changes: SalonPageChanges): Promise<SalonPageSettings> {
    await this.checkPhoto(changes.logoPhotoId);
    await this.checkPhoto(changes.heroPhotoId);
    const { sections, ...fields } = changes;
    const salon = await this.prisma.$transaction(async (tx) => {
      const current = await tx.salon.findUniqueOrThrow({
        where: { id: this.salonId() },
      });
      return tx.salon.update({
        where: { id: current.id },
        data: {
          ...fields,
          ...(sections && {
            sections: { ...pageSections(current.sections), ...sections },
          }),
        },
      });
    });
    return toSettings(salon);
  }

  /** `422` for a Photo that is not the Salon's; `null` clears and needs no check. */
  private async checkPhoto(id: string | null | undefined): Promise<void> {
    if (!id) return;
    if ((await this.prisma.photo.count({ where: { id } })) === 0) {
      throw new UnprocessableEntityException(SALON_PHOTO_NOT_FOUND);
    }
  }

  private salon(): Promise<Salon> {
    return this.prisma.salon.findUniqueOrThrow({
      where: { id: this.salonId() },
    });
  }

  private salonId(): string {
    const salonId = this.cls.get('salonId');
    if (!salonId) throw new Error('SalonPageService needs a Salon context');
    return salonId;
  }
}

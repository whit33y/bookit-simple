import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SERVICE_CATEGORY_HAS_SERVICES,
  SERVICE_CATEGORY_ORDER_MISMATCH,
  ServiceCategoryView,
} from '@bookit/shared';
import { ClsService } from 'nestjs-cls';
import { Prisma, ServiceCategory } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';

const toView = ({ id, name }: ServiceCategory): ServiceCategoryView => ({
  id,
  name,
});

const isPrismaError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

/**
 * The Kategorie Usług of the Salon from the context (#16). Queries are limited to that
 * Salon by the Prisma extension.
 */
@Injectable()
export class ServiceCategoriesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
  ) {}

  /** In the Salon's order; Kategorie at the same position by creation. */
  async list(): Promise<ServiceCategoryView[]> {
    const categories = await this.prisma.serviceCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return categories.map(toView);
  }

  /** At the end of the list. */
  async create(name: string): Promise<ServiceCategoryView> {
    const last = await this.prisma.serviceCategory.aggregate({
      _max: { sortOrder: true },
    });
    const category = await this.prisma.serviceCategory.create({
      data: {
        // The create input type requires it; the Salon filter checks it is the context's.
        salonId: this.salonId(),
        name,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    return toView(category);
  }

  /** `404` for a Kategoria of another Salon. */
  async rename(id: string, name: string): Promise<ServiceCategoryView> {
    try {
      return toView(
        await this.prisma.serviceCategory.update({
          where: { id },
          data: { name },
        }),
      );
    } catch (error) {
      if (isPrismaError(error, 'P2025')) throw new NotFoundException();
      throw error;
    }
  }

  /**
   * `409` while any Usługa, also an archived one, is in the Kategoria; `404` for a
   * Kategoria of another Salon. The foreign key catches a Usługa added after the check.
   */
  async remove(id: string): Promise<void> {
    const category = await this.prisma.serviceCategory.findUnique({
      where: { id },
      include: { _count: { select: { services: true } } },
    });
    if (!category) throw new NotFoundException();
    if (category._count.services > 0) {
      throw new ConflictException(SERVICE_CATEGORY_HAS_SERVICES);
    }
    try {
      await this.prisma.serviceCategory.delete({ where: { id } });
    } catch (error) {
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException(SERVICE_CATEGORY_HAS_SERVICES);
      }
      if (isPrismaError(error, 'P2025')) throw new NotFoundException();
      throw error;
    }
  }

  /** `ids` must name every Kategoria of the Salon exactly once, else `400`. */
  async reorder(ids: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const categories = await tx.serviceCategory.findMany({
        select: { id: true },
      });
      const current = new Set(categories.map((c) => c.id));
      const exact =
        ids.length === current.size &&
        new Set(ids).size === ids.length &&
        ids.every((id) => current.has(id));
      if (!exact)
        throw new BadRequestException(SERVICE_CATEGORY_ORDER_MISMATCH);
      for (const [sortOrder, id] of ids.entries()) {
        await tx.serviceCategory.update({ where: { id }, data: { sortOrder } });
      }
    });
  }

  private salonId(): string {
    const salonId = this.cls.get('salonId');
    if (!salonId) {
      throw new Error('ServiceCategoriesService needs a Salon context');
    }
    return salonId;
  }
}

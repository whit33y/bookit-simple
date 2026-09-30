import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SERVICE_CATEGORY_REQUIRED,
  SERVICE_NAME_TAKEN,
  SERVICE_ORDER_MISMATCH,
  ServiceView,
} from '@bookit/shared';
import { ClsService } from 'nestjs-cls';
import { Prisma, Service } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';
import type { ServiceChanges, ServiceFields } from './services.controller';

type Db = Pick<PrismaService, 'service' | 'serviceCategory'>;

const toView = (service: Service): ServiceView => ({
  id: service.id,
  categoryId: service.categoryId,
  name: service.name,
  description: service.description,
  priceGrosze: service.priceGrosze,
  priceType: service.priceType,
  durationMin: service.durationMin,
  breakMin: service.breakMin,
  hidden: service.hidden,
  archived: service.archivedAt !== null,
});

const isPrismaError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

/**
 * The Usługi of the Salon from the context (#17). Queries are limited to that Salon by
 * the Prisma extension, so a Kategoria or Usługa of another Salon is not found.
 * Usługi are archived, never deleted: Wizyty refer to them.
 */
@Injectable()
export class ServicesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
  ) {}

  /** By Kategoria order, then the Usługa order; Usługi at the same position by creation. */
  async list(includeArchived: boolean): Promise<ServiceView[]> {
    const services = await this.prisma.service.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { category: { createdAt: 'asc' } },
        { categoryId: 'asc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });
    return services.map(toView);
  }

  /** At the end of its Kategoria. */
  async create(fields: ServiceFields): Promise<ServiceView> {
    return this.prisma.$transaction(async (tx) => {
      await this.checkCategory(tx, fields.categoryId);
      await this.checkNameFree(tx, fields.categoryId, fields.name);
      const service = await tx.service.create({
        data: {
          ...fields,
          // The create input type requires it; the Salon filter checks it is the context's.
          salonId: this.salonId(),
          sortOrder: await this.nextSortOrder(tx, fields.categoryId),
        },
      });
      return toView(service);
    });
  }

  /**
   * A new Kategoria puts the Usługa at its end. The name is checked only for a Usługa
   * that is not archived: an archived one is checked when it comes back.
   */
  async update(id: string, changes: ServiceChanges): Promise<ServiceView> {
    return this.prisma.$transaction(async (tx) => {
      const service = await this.find(tx, id);
      const categoryId = changes.categoryId ?? service.categoryId;
      const moved = categoryId !== service.categoryId;
      if (moved) await this.checkCategory(tx, categoryId);
      if (service.archivedAt === null && (moved || changes.name)) {
        await this.checkNameFree(
          tx,
          categoryId,
          changes.name ?? service.name,
          id,
        );
      }
      const updated = await tx.service.update({
        where: { id },
        data: {
          ...changes,
          ...(moved && { sortOrder: await this.nextSortOrder(tx, categoryId) }),
        },
      });
      return toView(updated);
    });
  }

  /** Archiving an archived Usługa keeps its first date. */
  async archive(id: string): Promise<ServiceView> {
    return this.prisma.$transaction(async (tx) => {
      const service = await this.find(tx, id);
      if (service.archivedAt) return toView(service);
      return toView(
        await tx.service.update({
          where: { id },
          data: { archivedAt: new Date() },
        }),
      );
    });
  }

  /** Back at the end of its Kategoria; `409` when its name is taken there meanwhile. */
  async unarchive(id: string): Promise<ServiceView> {
    return this.prisma.$transaction(async (tx) => {
      const service = await this.find(tx, id);
      if (!service.archivedAt) return toView(service);
      await this.checkNameFree(tx, service.categoryId, service.name, id);
      return toView(
        await tx.service.update({
          where: { id },
          data: {
            archivedAt: null,
            sortOrder: await this.nextSortOrder(tx, service.categoryId),
          },
        }),
      );
    });
  }

  /**
   * `ids` must name every Usługa of the Kategoria that is not archived, exactly once,
   * else `400`, also when one is archived while the order is being saved.
   */
  async reorder(categoryId: string, ids: string[]): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const services = await tx.service.findMany({
          where: { categoryId, archivedAt: null },
          select: { id: true },
        });
        const current = new Set(services.map((s) => s.id));
        const exact =
          ids.length === current.size &&
          new Set(ids).size === ids.length &&
          ids.every((id) => current.has(id));
        if (!exact) throw new BadRequestException(SERVICE_ORDER_MISMATCH);
        for (const [sortOrder, id] of ids.entries()) {
          await tx.service.update({
            where: { id, archivedAt: null },
            data: { sortOrder },
          });
        }
      });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new BadRequestException(SERVICE_ORDER_MISMATCH);
      }
      throw error;
    }
  }

  private async find(db: Db, id: string): Promise<Service> {
    const service = await db.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException();
    return service;
  }

  /** `400` for a Kategoria that is not in the Salon. */
  private async checkCategory(db: Db, categoryId: string): Promise<void> {
    const category = await db.serviceCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) throw new BadRequestException(SERVICE_CATEGORY_REQUIRED);
  }

  /** Names are unique in a Kategoria, ignoring case, among Usługi that are not archived. */
  private async checkNameFree(
    db: Db,
    categoryId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const taken = await db.service.findFirst({
      where: {
        categoryId,
        archivedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (taken) throw new ConflictException(SERVICE_NAME_TAKEN);
  }

  private async nextSortOrder(db: Db, categoryId: string): Promise<number> {
    const last = await db.service.aggregate({
      where: { categoryId },
      _max: { sortOrder: true },
    });
    return (last._max.sortOrder ?? -1) + 1;
  }

  private salonId(): string {
    const salonId = this.cls.get('salonId');
    if (!salonId) throw new Error('ServicesService needs a Salon context');
    return salonId;
  }
}

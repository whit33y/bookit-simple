import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  GALLERY_FULL,
  GALLERY_MAX_PHOTOS,
  GALLERY_ORDER_MISMATCH,
  GALLERY_PHOTO_ALREADY_ADDED,
  GALLERY_PHOTO_NOT_FOUND,
  GalleryPhotoView,
} from '@bookit/shared';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '../../generated/prisma/client';
import { PhotosService, photoView } from '../photos/photos.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';

const isPrismaError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

const BY_SORT_ORDER = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
] satisfies Prisma.GalleryItemOrderByWithRelationInput[];

/**
 * The gallery of the Salon from the context (#21): at most `GALLERY_MAX_PHOTOS` Photos
 * in the Właściciel's order. Queries are limited to that Salon by the Prisma extension.
 */
@Injectable()
export class GalleryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PhotosService) private readonly photos: PhotosService,
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
  ) {}

  /** In the order of the Wizytówka; items at the same position by when they were added. */
  async list(): Promise<GalleryPhotoView[]> {
    const items = await this.prisma.galleryItem.findMany({
      orderBy: BY_SORT_ORDER,
      include: { photo: true },
    });
    return items.map((item) => photoView(item.photo));
  }

  /**
   * At the end of the gallery. `400` for a Photo the Salon does not have, `409` for one
   * already in the gallery, `422` when the gallery is full. The Salon row is locked, so
   * two uploads at once cannot both take the last place.
   */
  async add(photoId: string): Promise<GalleryPhotoView> {
    const salonId = this.salonId();
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "Salon" WHERE id = ${salonId}::uuid FOR UPDATE`;
        const photo = await tx.photo.findUnique({ where: { id: photoId } });
        if (!photo) throw new BadRequestException(GALLERY_PHOTO_NOT_FOUND);
        if (await tx.galleryItem.findUnique({ where: { photoId } })) {
          throw new ConflictException(GALLERY_PHOTO_ALREADY_ADDED);
        }
        if ((await tx.galleryItem.count()) >= GALLERY_MAX_PHOTOS) {
          throw new UnprocessableEntityException(GALLERY_FULL);
        }
        const last = await tx.galleryItem.aggregate({
          _max: { sortOrder: true },
        });
        await tx.galleryItem.create({
          data: {
            // The create input type requires it; the Salon filter checks it is the context's.
            salonId,
            photoId,
            sortOrder: (last._max.sortOrder ?? -1) + 1,
          },
        });
        return photoView(photo);
      });
    } catch (error) {
      // The same Photo from another Salon's gallery cannot get here: the Photo filter hides it.
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(GALLERY_PHOTO_ALREADY_ADDED);
      }
      throw error;
    }
  }

  /** Deletes the Photo too, file included. `404` for a Photo outside the gallery. */
  async remove(photoId: string): Promise<void> {
    const item = await this.prisma.galleryItem.findUnique({
      where: { photoId },
    });
    if (!item) throw new NotFoundException();
    await this.photos.remove(photoId);
  }

  /**
   * `photoIds` must name every Photo of the gallery exactly once, else `400`, also when
   * one is deleted while the order is being saved.
   */
  async reorder(photoIds: string[]): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const items = await tx.galleryItem.findMany({
          select: { photoId: true },
        });
        const current = new Set(items.map((item) => item.photoId));
        const exact =
          photoIds.length === current.size &&
          new Set(photoIds).size === photoIds.length &&
          photoIds.every((id) => current.has(id));
        if (!exact) throw new BadRequestException(GALLERY_ORDER_MISMATCH);
        for (const [sortOrder, photoId] of photoIds.entries()) {
          await tx.galleryItem.update({
            where: { photoId },
            data: { sortOrder },
          });
        }
      });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new BadRequestException(GALLERY_ORDER_MISMATCH);
      }
      throw error;
    }
  }

  private salonId(): string {
    const salonId = this.cls.get('salonId');
    if (!salonId) throw new Error('GalleryService needs a Salon context');
    return salonId;
  }
}

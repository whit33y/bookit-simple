import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PhotoView, photoUrl } from '@bookit/shared';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Photo } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';
import { PhotoStorage } from './photo-storage';
import { processPhoto } from './process-photo';

export const PHOTO_CONTENT_TYPE = 'image/webp';

const toView = ({ id, width, height, bytes }: Photo): PhotoView => ({
  id,
  url: photoUrl(id),
  width,
  height,
  bytes,
});

/**
 * Photos of the Salon from the context (#19): the logo, the Wizytówka header, the
 * gallery, Ogłoszenia and the Personel all point at one. Queries are limited to that
 * Salon by the Prisma extension, except `open`, which serves any Salon's Photo.
 */
@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PhotoStorage) private readonly storage: PhotoStorage,
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
  ) {}

  /** `415` for an unsupported file, see `processPhoto`. */
  async upload(file: Buffer): Promise<PhotoView> {
    const { webp, width, height } = await processPhoto(file);
    const salonId = this.salonId();
    const id = randomUUID();
    const storageKey = `salons/${salonId}/${id}.webp`;

    await this.storage.put(storageKey, webp, PHOTO_CONTENT_TYPE);
    try {
      const photo = await this.prisma.photo.create({
        data: { id, salonId, storageKey, width, height, bytes: webp.length },
      });
      return toView(photo);
    } catch (error) {
      await this.deleteFile(storageKey);
      throw error;
    }
  }

  /**
   * `404` for a Photo of another Salon. The database sets the logo, header, Ogłoszenie
   * and Personel references to `null` and drops the gallery item.
   */
  async remove(id: string): Promise<void> {
    const photo = await this.prisma.photo.findUnique({ where: { id } });
    if (!photo) throw new NotFoundException();
    // The row first: a file left behind is harmless, a row without a file is a broken image.
    await this.prisma.photo.deleteMany({ where: { id } });
    await this.deleteFile(photo.storageKey);
  }

  /** The WebP of any Salon's Photo, `null` for an unknown one. Needs `@AdminScope()`. */
  async open(id: string): Promise<Readable | null> {
    const photo = await this.prisma.photo.findUnique({
      where: { id },
      select: { storageKey: true },
    });
    return photo ? this.storage.get(photo.storageKey) : null;
  }

  private async deleteFile(storageKey: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch (error) {
      this.logger.warn(`Could not delete ${storageKey}: ${String(error)}`);
    }
  }

  private salonId(): string {
    const salonId = this.cls.get('salonId');
    if (!salonId) throw new Error('PhotosService needs a Salon context');
    return salonId;
  }
}

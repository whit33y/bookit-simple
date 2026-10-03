import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CropPhotoRequest,
  PHOTO_CROP_OUTSIDE,
  PROFILE_PHOTO_SIDE,
  PhotoView,
  photoUrl,
} from '@bookit/shared';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Photo } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';
import { PhotoStorage } from './photo-storage';
import { cropPhoto, ProcessedPhoto, processPhoto } from './process-photo';

export const PHOTO_CONTENT_TYPE = 'image/webp';

/** Also for views that list Photos, like the gallery. */
export const photoView = ({ id, width, height, bytes }: Photo): PhotoView => ({
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
    return this.store(await processPhoto(file));
  }

  /**
   * A Zdjęcie profilowe out of an uploaded Photo: the square becomes a new Photo of at
   * most `PROFILE_PHOTO_SIDE` px a side, and the source Photo goes with its file.
   * `404` for a Photo of another Salon, `400` for a square that leaves the photo.
   */
  async crop(id: string, square: CropPhotoRequest): Promise<PhotoView> {
    const source = await this.prisma.photo.findUnique({ where: { id } });
    if (!source) throw new NotFoundException();
    const { x, y, size } = square;
    if (
      x < 0 ||
      y < 0 ||
      size < 1 ||
      x + size > source.width ||
      y + size > source.height
    ) {
      throw new BadRequestException(PHOTO_CROP_OUTSIDE);
    }
    const file = await this.storage.get(source.storageKey);
    if (!file) throw new NotFoundException();

    const photo = await this.store(
      await cropPhoto(await buffer(file), square, PROFILE_PHOTO_SIDE),
    );
    await this.remove(source.id);
    return photo;
  }

  private async store({
    webp,
    width,
    height,
  }: ProcessedPhoto): Promise<PhotoView> {
    const salonId = this.salonId();
    const id = randomUUID();
    const storageKey = `salons/${salonId}/${id}.webp`;

    await this.storage.put(storageKey, webp, PHOTO_CONTENT_TYPE);
    try {
      const photo = await this.prisma.photo.create({
        data: { id, salonId, storageKey, width, height, bytes: webp.length },
      });
      return photoView(photo);
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

  /**
   * For a Photo row deleted elsewhere, e.g. in a transaction of the Personel; call it
   * after the commit. A failure is only logged: a file left behind is harmless.
   */
  async deleteFile(storageKey: string): Promise<void> {
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

async function buffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

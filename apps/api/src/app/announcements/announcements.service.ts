import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ANNOUNCEMENT_ENDS_BEFORE_START,
  ANNOUNCEMENT_PHOTO_NOT_FOUND,
  AnnouncementDays,
  AnnouncementView,
  endsOnOrAfterStart,
} from '@bookit/shared';
import { ClsService } from 'nestjs-cls';
import { Announcement, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PhotosService } from '../photos/photos.service';
import { SalonContext } from '../salon-context/salon-context';
import type {
  AnnouncementChanges,
  AnnouncementFields,
} from './announcements.controller';
import { fromCalendarDay, toCalendarDay } from './calendar-day-column';

type Db = Pick<PrismaService, 'announcement' | 'photo'>;

const toView = (announcement: Announcement): AnnouncementView => ({
  id: announcement.id,
  title: announcement.title,
  body: announcement.body,
  photoId: announcement.photoId,
  showFrom: toCalendarDay(announcement.showFrom),
  showUntil: announcement.showUntil
    ? toCalendarDay(announcement.showUntil)
    : null,
});

/** The days as Prisma writes them into the `date` columns. */
const dayColumns = (days: Partial<AnnouncementDays>) => ({
  ...(days.showFrom !== undefined && {
    showFrom: fromCalendarDay(days.showFrom),
  }),
  ...(days.showUntil !== undefined && {
    showUntil: days.showUntil === null ? null : fromCalendarDay(days.showUntil),
  }),
});

function checkDays(days: AnnouncementDays): void {
  if (!endsOnOrAfterStart(days)) {
    throw new UnprocessableEntityException(ANNOUNCEMENT_ENDS_BEFORE_START);
  }
}

/**
 * The Ogłoszenia of the Salon from the context (#22). Queries are limited to that Salon
 * by the Prisma extension, so an Ogłoszenie or Photo of another Salon is not found.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PhotosService) private readonly photos: PhotosService,
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
  ) {}

  /** Newest `showFrom` first, like the Wizytówka; the panel groups them itself. */
  async list(): Promise<AnnouncementView[]> {
    const announcements = await this.prisma.announcement.findMany({
      orderBy: [{ showFrom: 'desc' }, { createdAt: 'desc' }],
    });
    return announcements.map(toView);
  }

  async create(fields: AnnouncementFields): Promise<AnnouncementView> {
    checkDays(fields);
    return this.prisma.$transaction(async (tx) => {
      if (fields.photoId) await this.checkPhoto(tx, fields.photoId);
      const announcement = await tx.announcement.create({
        data: {
          ...fields,
          ...dayColumns(fields),
          // The create input type requires it; the Salon filter checks it is the context's.
          salonId: this.salonId(),
        },
      });
      return toView(announcement);
    });
  }

  async update(
    id: string,
    changes: AnnouncementChanges,
  ): Promise<AnnouncementView> {
    const { view, storageKey } = await this.change(async (tx) => {
      const current = await tx.announcement.findUnique({ where: { id } });
      if (!current) throw new NotFoundException();
      const { showFrom, showUntil } = toView(current);
      checkDays({
        showFrom: changes.showFrom ?? showFrom,
        showUntil:
          changes.showUntil === undefined ? showUntil : changes.showUntil,
      });
      if (changes.photoId) await this.checkPhoto(tx, changes.photoId);
      const updated = await tx.announcement.update({
        where: { id },
        data: { ...changes, ...dayColumns(changes) },
      });
      const storageKey =
        current.photoId &&
        changes.photoId !== undefined &&
        changes.photoId !== current.photoId
          ? await this.photos.deleteUnused(tx, current.photoId)
          : null;
      return { view: toView(updated), storageKey };
    });
    if (storageKey) await this.photos.deleteFile(storageKey);
    return view;
  }

  async remove(id: string): Promise<void> {
    const storageKey = await this.change(async (tx) => {
      const current = await tx.announcement.findUnique({ where: { id } });
      if (!current) throw new NotFoundException();
      await tx.announcement.delete({ where: { id } });
      return current.photoId
        ? this.photos.deleteUnused(tx, current.photoId)
        : null;
    });
    if (storageKey) await this.photos.deleteFile(storageKey);
  }

  /** Serializable writes retry if another request changed the same Ogłoszenie or Photo. */
  private async change<T>(operation: (db: Db) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034' ||
          attempt >= 2
        )
          throw error;
      }
    }
  }

  /** `400` for a Photo that is not in the Salon. */
  private async checkPhoto(db: Db, photoId: string): Promise<void> {
    const photo = await db.photo.findUnique({
      where: { id: photoId },
      select: { id: true },
    });
    if (!photo) throw new BadRequestException(ANNOUNCEMENT_PHOTO_NOT_FOUND);
  }

  private salonId(): string {
    const salonId = this.cls.get('salonId');
    if (!salonId) throw new Error('AnnouncementsService needs a Salon context');
    return salonId;
  }
}

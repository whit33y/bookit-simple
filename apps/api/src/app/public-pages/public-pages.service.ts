import { Inject, Injectable } from '@nestjs/common';
import {
  isAnnouncementVisible,
  pageSections,
  PublicPage,
  warsawDate,
} from '@bookit/shared';
import { ClsService } from 'nestjs-cls';
import { Salon } from '../../generated/prisma/client';
import {
  fromCalendarDay,
  toCalendarDay,
} from '../announcements/calendar-day-column';
import { toClockTime } from '../opening-hours/clock-time';
import { PrismaService } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';

const PHOTO_SELECT = {
  select: { id: true, width: true, height: true },
} as const;

const BY_SORT_ORDER = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
] as const satisfies object[];

/**
 * The Wizytówka of one Salon, with every field picked by name: the reply is public.
 * The route reads across Salons to find the Salon; the page itself is read in that
 * Salon's context, so the isolation extension filters it like any panel query (ADR 0001).
 */
@Injectable()
export class PublicPagesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
  ) {}

  async page(salon: Salon, now = new Date()): Promise<PublicPage> {
    const today = warsawDate(now);
    // Prisma queries are lazy: they run on `then`, so await inside the context.
    const [categories, announcements, staff, gallery, openingHours, photos] =
      await this.cls.runWith(
        { salonId: salon.id },
        async () =>
          await Promise.all([
            this.prisma.serviceCategory.findMany({
              orderBy: BY_SORT_ORDER,
              select: {
                name: true,
                services: {
                  where: { hidden: false, archivedAt: null },
                  orderBy: BY_SORT_ORDER,
                  select: {
                    name: true,
                    description: true,
                    priceGrosze: true,
                    priceType: true,
                    durationMin: true,
                  },
                },
              },
            }),
            this.prisma.announcement.findMany({
              // Past ones stay out of the query; `isAnnouncementVisible` has the final say.
              where: {
                OR: [
                  { showUntil: null },
                  { showUntil: { gte: fromCalendarDay(today) } },
                ],
              },
              orderBy: [{ showFrom: 'desc' }, { createdAt: 'desc' }],
              select: {
                title: true,
                body: true,
                photo: PHOTO_SELECT,
                showFrom: true,
                showUntil: true,
              },
            }),
            this.prisma.staffMember.findMany({
              where: { showOnPage: true, deletedAt: null },
              orderBy: BY_SORT_ORDER,
              select: { displayName: true, bio: true, photo: PHOTO_SELECT },
            }),
            this.prisma.galleryItem.findMany({
              orderBy: BY_SORT_ORDER,
              select: { photo: PHOTO_SELECT },
            }),
            this.prisma.openingHours.findMany({
              orderBy: { weekday: 'asc' },
              select: { weekday: true, opensAt: true, closesAt: true },
            }),
            this.prisma.photo.findMany({
              where: {
                id: {
                  in: [salon.logoPhotoId, salon.heroPhotoId].filter(
                    (id) => id !== null,
                  ),
                },
              },
              ...PHOTO_SELECT,
            }),
          ]),
      );

    const photo = (id: string | null) =>
      photos.find((candidate) => candidate.id === id) ?? null;

    return {
      salon: {
        name: salon.name,
        slug: salon.slug,
        about: salon.about,
        street: salon.street,
        postalCode: salon.postalCode,
        city: salon.city,
        phone: salon.phone,
        email: salon.email,
        mapUrl: salon.mapUrl,
        headerLayout: salon.headerLayout,
        accentColor: salon.accentColor,
        logo: photo(salon.logoPhotoId),
        hero: photo(salon.heroPhotoId),
      },
      sections: pageSections(salon.sections),
      categories: categories
        .filter((category) => category.services.length > 0)
        .map(({ name, services }) => ({
          name,
          services: services.map((service) => ({
            name: service.name,
            description: service.description,
            priceGrosze: service.priceGrosze,
            priceType: service.priceType,
            durationMin: service.durationMin,
          })),
        })),
      announcements: announcements
        .map((announcement) => ({
          title: announcement.title,
          body: announcement.body,
          photo: announcement.photo,
          showFrom: toCalendarDay(announcement.showFrom),
          showUntil: announcement.showUntil
            ? toCalendarDay(announcement.showUntil)
            : null,
        }))
        .filter((announcement) => isAnnouncementVisible(announcement, now)),
      staff: staff.map((member) => ({
        displayName: member.displayName,
        bio: member.bio,
        photo: member.photo,
      })),
      gallery: gallery.map((item) => item.photo),
      openingHours: openingHours.map((hours) => ({
        weekday: hours.weekday,
        opensAt: toClockTime(hours.opensAt),
        closesAt: toClockTime(hours.closesAt),
      })),
      privacyNotice: salon.privacyNotice,
    };
  }
}

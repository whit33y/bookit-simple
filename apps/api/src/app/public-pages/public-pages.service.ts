import { Inject, Injectable } from '@nestjs/common';
import {
  ALL_PAGE_SECTIONS,
  isAnnouncementVisible,
  PageSections,
  PublicPage,
  warsawDate,
} from '@bookit/shared';
import { Salon } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** `@db.Date` comes back as midnight UTC. */
const calendarDay = (date: Date) => date.toISOString().slice(0, 10);
/** `@db.Time` comes back as 1970-01-01 in UTC. */
const clockTime = (date: Date) => date.toISOString().slice(11, 16);

/** Only the known sections, as booleans; a missing one is on, like for a new Salon. */
function pageSections(stored: unknown): PageSections {
  const saved = (stored ?? {}) as Partial<Record<string, unknown>>;
  const sections = { ...ALL_PAGE_SECTIONS };
  for (const key of Object.keys(sections) as (keyof PageSections)[]) {
    const value = saved[key];
    if (typeof value === 'boolean') sections[key] = value;
  }
  return sections;
}

/**
 * The Wizytówka of one Salon. Runs across Salons (`@AdminScope()`), so every query
 * filters by `salonId` itself, and every field is picked by name: the reply is public.
 */
@Injectable()
export class PublicPagesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async page(salon: Salon, now = new Date()): Promise<PublicPage> {
    const salonId = salon.id;
    const [categories, announcements, staff, gallery, openingHours] =
      await Promise.all([
        this.prisma.serviceCategory.findMany({
          where: { salonId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            name: true,
            services: {
              where: { salonId, hidden: false, archivedAt: null },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
          where: { salonId },
          orderBy: [{ showFrom: 'desc' }, { createdAt: 'desc' }],
          select: {
            title: true,
            body: true,
            photoId: true,
            showFrom: true,
            showUntil: true,
          },
        }),
        this.prisma.staffMember.findMany({
          where: { salonId, showOnPage: true, deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { displayName: true, bio: true, photoId: true },
        }),
        this.prisma.galleryItem.findMany({
          where: { salonId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { photoId: true },
        }),
        this.prisma.openingHours.findMany({
          where: { salonId },
          orderBy: { weekday: 'asc' },
          select: { weekday: true, opensAt: true, closesAt: true },
        }),
      ]);

    const today = warsawDate(now);
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
        accentColor: salon.accentColor,
        logoPhotoId: salon.logoPhotoId,
        heroPhotoId: salon.heroPhotoId,
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
          photoId: announcement.photoId,
          showFrom: calendarDay(announcement.showFrom),
          showUntil: announcement.showUntil
            ? calendarDay(announcement.showUntil)
            : null,
        }))
        .filter((announcement) => isAnnouncementVisible(announcement, today)),
      staff: staff.map((member) => ({
        displayName: member.displayName,
        bio: member.bio,
        photoId: member.photoId,
      })),
      gallery: gallery.map((item) => ({ photoId: item.photoId })),
      openingHours: openingHours.map((hours) => ({
        weekday: hours.weekday,
        opensAt: clockTime(hours.opensAt),
        closesAt: clockTime(hours.closesAt),
      })),
      privacyNotice: salon.privacyNotice,
    };
  }
}

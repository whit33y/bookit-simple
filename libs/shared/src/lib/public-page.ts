import { CalendarDay } from './calendar-day';
import { OpeningHoursDay } from './opening-hours';
import { PageSections } from './salon-page';

export type PriceType = 'FIXED' | 'FROM';

/** A Usługa on the Cennik. Hidden and archived ones are left out. */
export interface PublicService {
  name: string;
  description: string | null;
  priceGrosze: number;
  /** `FROM` is shown as "od 80 zł". */
  priceType: PriceType;
  durationMin: number;
}

/** A Kategoria Usług with at least one Usługa shown. */
export interface PublicServiceCategory {
  name: string;
  services: PublicService[];
}

/** An Ogłoszenie shown today, newest first. */
export interface PublicAnnouncement {
  title: string;
  body: string;
  photoId: string | null;
  showFrom: CalendarDay;
  showUntil: CalendarDay | null;
}

/** A person from the Personel with `showOnPage`. */
export interface PublicStaffMember {
  displayName: string;
  bio: string | null;
  photoId: string | null;
}

export interface PublicGalleryItem {
  photoId: string;
}

/** Godziny otwarcia of one weekday; a missing weekday is closed. */
export type PublicOpeningHours = OpeningHoursDay;

/** `GET /api/public/pages/:slug`: everything the Wizytówka shows, and nothing more. */
export interface PublicPage {
  salon: {
    name: string;
    /** Adres wizytówki */
    slug: string;
    about: string | null;
    street: string | null;
    postalCode: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
    mapUrl: string | null;
    accentColor: string | null;
    logoPhotoId: string | null;
    heroPhotoId: string | null;
  };
  sections: PageSections;
  categories: PublicServiceCategory[];
  announcements: PublicAnnouncement[];
  staff: PublicStaffMember[];
  gallery: PublicGalleryItem[];
  openingHours: PublicOpeningHours[];
  privacyNotice: string | null;
}

/** `301` body for an old Adres wizytówki; the Wizytówka is now under `slug`. */
export interface PublicPageRedirect {
  slug: string;
}

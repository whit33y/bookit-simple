import { CalendarDay } from './calendar-day';
import { OpeningHoursDay } from './opening-hours';
import { PageHeaderLayout, PageSections } from './salon-page';

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

/** A Photo with its size, so `<img>` reserves the space before the file loads. */
export interface PublicPhoto {
  /** For `photoUrl(id)` */
  id: string;
  width: number;
  height: number;
}

/** An Ogłoszenie shown today, newest first. */
export interface PublicAnnouncement {
  title: string;
  body: string;
  photo: PublicPhoto | null;
  showFrom: CalendarDay;
  showUntil: CalendarDay | null;
}

/** A person from the Personel with `showOnPage`. */
export interface PublicStaffMember {
  displayName: string;
  bio: string | null;
  photo: PublicPhoto | null;
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
    headerLayout: PageHeaderLayout;
    logo: PublicPhoto | null;
    hero: PublicPhoto | null;
  };
  sections: PageSections;
  categories: PublicServiceCategory[];
  announcements: PublicAnnouncement[];
  staff: PublicStaffMember[];
  /** In the order set by the Właściciel */
  gallery: PublicPhoto[];
  openingHours: PublicOpeningHours[];
  privacyNotice: string | null;
}

/** `301` body for an old Adres wizytówki; the Wizytówka is now under `slug`. */
export interface PublicPageRedirect {
  slug: string;
}

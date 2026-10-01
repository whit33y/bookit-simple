import { PriceType, StaffRole } from '../../generated/prisma/client';

/** Studio Kora from docs/mvp.md, section 9: the pilot Salon for manual and e2e tests. */
export const STUDIO_KORA = {
  name: 'Studio Kora',
  slug: 'studio-kora',
  street: 'ul. Długa 12',
  postalCode: '31-147',
  city: 'Kraków',
  phone: '+48600100200',
  email: 'kontakt@studio-kora.test',
  mapUrl:
    'https://www.openstreetmap.org/search?query=D%C5%82uga%2012%20Krak%C3%B3w',
  accentColor: '#9c4f3c',
  about:
    'Kameralny salon na krakowskim Kleparzu. Strzyżemy, koloryzujemy, robimy paznokcie i brwi. Umów się telefonicznie, oddzwonimy, jeśli nie odbierzemy.',
  privacyNotice:
    'Administratorem Twoich danych jest Studio Kora, ul. Długa 12, 31-147 Kraków. Imię i numer telefonu zapisujemy tylko po to, żeby umówić Wizytę i przypomnieć o niej. Możesz poprosić o ich wgląd, poprawienie albo usunięcie, dzwoniąc pod +48 600 100 200.',
} as const;

/** Every Pracownik shares the domain; the part before `@` is the person. */
export const STAFF_EMAIL_DOMAIN = 'studio-kora.test';

export type StaffKey = 'magda' | 'kasia' | 'ola' | 'natalia';

export type CategoryKey = 'haircut' | 'colour' | 'nails' | 'face';

export interface SeedStaffMember {
  key: StaffKey;
  displayName: string;
  role: StaffRole;
  bio: string;
  /** Which Kategorie the person takes Wizyty for. */
  categories: CategoryKey[];
}

export const STAFF: SeedStaffMember[] = [
  {
    key: 'magda',
    displayName: 'Magda',
    role: 'OWNER',
    bio: 'Właścicielka i fryzjerka. Najchętniej strzyże krótkie fryzury i robi balayage.',
    categories: ['haircut', 'colour'],
  },
  {
    key: 'kasia',
    displayName: 'Kasia',
    role: 'EMPLOYEE',
    bio: 'Fryzjerka. Koloryzacja to jej konik.',
    categories: ['haircut', 'colour'],
  },
  {
    key: 'ola',
    displayName: 'Ola',
    role: 'EMPLOYEE',
    bio: 'Stylistka paznokci. Hybryda, żel i pedicure.',
    categories: ['nails'],
  },
  {
    key: 'natalia',
    displayName: 'Natalia',
    role: 'EMPLOYEE',
    bio: 'Kosmetyczka od twarzy i brwi.',
    categories: ['face'],
  },
];

export interface SeedService {
  name: string;
  priceZl: number;
  priceType: PriceType;
  durationMin: number;
  breakMin: number;
}

const service = (
  name: string,
  priceZl: number,
  priceType: PriceType,
  durationMin: number,
  breakMin = 0,
): SeedService => ({ name, priceZl, priceType, durationMin, breakMin });

export const CATEGORIES: {
  key: CategoryKey;
  name: string;
  services: SeedService[];
}[] = [
  {
    key: 'haircut',
    name: 'Strzyżenie',
    services: [
      service('Strzyżenie damskie', 90, 'FROM', 45, 10),
      service('Strzyżenie męskie', 60, 'FIXED', 30, 5),
      service('Strzyżenie dziecięce', 45, 'FIXED', 30, 5),
      service('Grzywka', 20, 'FIXED', 10),
    ],
  },
  {
    key: 'colour',
    name: 'Koloryzacja',
    services: [
      service('Koloryzacja jednym kolorem', 180, 'FROM', 90, 15),
      service('Balayage', 350, 'FROM', 180, 15),
      service('Tonowanie', 120, 'FIXED', 45, 10),
      service('Odrost', 150, 'FROM', 75, 15),
    ],
  },
  {
    key: 'nails',
    name: 'Paznokcie',
    services: [
      service('Manicure hybrydowy', 120, 'FIXED', 75, 10),
      service('Zdjęcie hybrydy', 40, 'FIXED', 20, 5),
      service('Pedicure hybrydowy', 150, 'FIXED', 90, 15),
      service('Przedłużanie żelem', 200, 'FROM', 120, 10),
    ],
  },
  {
    key: 'face',
    name: 'Twarz i brwi',
    services: [
      service('Oczyszczanie wodorowe', 180, 'FIXED', 60, 15),
      service('Henna brwi', 50, 'FIXED', 20, 5),
      service('Laminacja brwi', 120, 'FIXED', 45, 10),
      service('Regulacja brwi', 30, 'FIXED', 15),
    ],
  },
];

/** Usługi often booked together on one Wizyta. */
export const COMBOS: string[][] = [
  ['Strzyżenie damskie', 'Grzywka'],
  ['Koloryzacja jednym kolorem', 'Strzyżenie damskie'],
  ['Zdjęcie hybrydy', 'Manicure hybrydowy'],
  ['Henna brwi', 'Regulacja brwi'],
];

/** Wizyty with no Usługa need a description. */
export const DESCRIPTIONS_WITHOUT_SERVICES = [
  'Konsultacja przed koloryzacją',
  'Poprawka po ostatniej wizycie',
  'Dobór koloru, klientka przyniesie zdjęcia',
];

/** pn–pt 9:00–19:00, sob 9:00–15:00, nd closed (no row). */
export const OPENING_HOURS = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    opensAt: '09:00',
    closesAt: '19:00',
  })),
  { weekday: 6, opensAt: '09:00', closesAt: '15:00' },
];

export const ANNOUNCEMENT = {
  title: 'Nowość: laminacja brwi',
  body: 'Do końca miesiąca -20%.',
};

export const FIRST_NAMES = [
  'Anna',
  'Maria',
  'Katarzyna',
  'Małgorzata',
  'Agnieszka',
  'Barbara',
  'Ewa',
  'Krystyna',
  'Elżbieta',
  'Zofia',
  'Joanna',
  'Magdalena',
  'Monika',
  'Julia',
  'Aleksandra',
  'Natalia',
  'Zuzanna',
  'Wiktoria',
  'Karolina',
  'Paulina',
  'Piotr',
  'Tomasz',
  'Michał',
  'Jakub',
  'Łukasz',
];

export const LAST_NAMES = [
  ['Kowalska', 'Kowalski'],
  ['Wiśniewska', 'Wiśniewski'],
  ['Wójcik', 'Wójcik'],
  ['Kamińska', 'Kamiński'],
  ['Lewandowska', 'Lewandowski'],
  ['Zielińska', 'Zieliński'],
  ['Szymańska', 'Szymański'],
  ['Woźniak', 'Woźniak'],
  ['Dąbrowska', 'Dąbrowski'],
  ['Kozłowska', 'Kozłowski'],
  ['Jankowska', 'Jankowski'],
  ['Mazur', 'Mazur'],
  ['Krawczyk', 'Krawczyk'],
  ['Piotrowska', 'Piotrowski'],
  ['Grabowska', 'Grabowski'],
  ['Pawłowska', 'Pawłowski'],
  ['Michalska', 'Michalski'],
  ['Król', 'Król'],
  ['Wieczorek', 'Wieczorek'],
  ['Jabłońska', 'Jabłoński'],
] as const;

/** The pair sharing one number: a mother who books for her daughter. */
export const SHARED_PHONE_PAIR = ['Ewa Nowak', 'Zuzia Nowak'];

/** Notes the Personel would write; never health information (ADR 0003). */
export const CLIENT_NOTES = [
  'Woli Wizyty rano, przed pracą.',
  'Kawa z mlekiem, bez cukru.',
  'Przychodzi z psem, który czeka w przedpokoju.',
  'Prosi o SMS dzień wcześniej.',
];

export const CLIENT_COUNT = 30;
export const CLIENTS_WITHOUT_PHONE = 5;

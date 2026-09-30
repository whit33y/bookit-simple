import { PriceType } from './public-page';

/**
 * One Usługa in `GET /api/services`: by Kategoria order, then the Usługa order.
 * Archived ones come only with `?includeArchived=true`.
 */
export interface ServiceView {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceGrosze: number;
  priceType: PriceType;
  durationMin: number;
  /** Default Przerwa po Wizycie */
  breakMin: number;
  /** Not shown on the Wizytówka */
  hidden: boolean;
  /** Left out of the Wizytówka and of picking Usługi for a Wizyta; old Wizyty keep it. */
  archived: boolean;
}

/** `POST /api/services` body. Replies `201` with the new `ServiceView`, last in its Kategoria. */
export interface CreateServiceRequest {
  categoryId: string;
  name: string;
  description?: string | null;
  priceGrosze: number;
  priceType: PriceType;
  durationMin: number;
  /** `0` when left out. */
  breakMin?: number;
  /** `false` when left out. */
  hidden?: boolean;
}

/**
 * `PATCH /api/services/:id` body: only the fields to change. A new `categoryId` moves the
 * Usługa to the end of that Kategoria. Replies with the `ServiceView`.
 */
export type UpdateServiceRequest = Partial<CreateServiceRequest>;

/**
 * `PUT /api/services/order` body: every Usługa of one Kategoria that is not archived,
 * in the new order. Replies `204`.
 */
export interface ServiceOrderRequest {
  categoryId: string;
  ids: string[];
}

export const SERVICE_NAME_MAX_LENGTH = 100;
export const SERVICE_DESCRIPTION_MAX_LENGTH = 1000;
/** 100 000 zł */
export const SERVICE_PRICE_MAX_GROSZE = 10_000_000;
export const SERVICE_DURATION_MIN = 5;
export const SERVICE_DURATION_MAX = 600;
export const SERVICE_BREAK_MAX = 120;
/** Czas trwania and Przerwa go in steps of 5 minutes. */
export const SERVICE_MINUTES_STEP = 5;

export const SERVICE_NAME_REQUIRED = 'Wpisz nazwę';
export const SERVICE_NAME_TOO_LONG = `Nazwa może mieć najwyżej ${SERVICE_NAME_MAX_LENGTH} znaków`;
export const SERVICE_DESCRIPTION_TOO_LONG = `Opis może mieć najwyżej ${SERVICE_DESCRIPTION_MAX_LENGTH} znaków`;
/** `400` for no Kategoria, or one that is not in the Salon. */
export const SERVICE_CATEGORY_REQUIRED = 'Wybierz Kategorię';
export const SERVICE_PRICE_INVALID = 'Wpisz cenę, np. 80 albo 79,50';
export const SERVICE_PRICE_TYPE_INVALID = 'Wybierz rodzaj ceny';
export const SERVICE_DURATION_INVALID = `Czas trwania: od ${SERVICE_DURATION_MIN} do ${SERVICE_DURATION_MAX} min, co ${SERVICE_MINUTES_STEP} min`;
export const SERVICE_BREAK_INVALID = `Przerwa: od 0 do ${SERVICE_BREAK_MAX} min, co ${SERVICE_MINUTES_STEP} min`;
/** `409`: names are unique in a Kategoria among the Usługi that are not archived. */
export const SERVICE_NAME_TAKEN =
  'W tej Kategorii jest już Usługa o tej nazwie';
/** `400` from `PUT /api/services/order`. */
export const SERVICE_ORDER_MISMATCH =
  'Lista musi zawierać każdą niezarchiwizowaną Usługę Kategorii dokładnie raz';

const inSteps = (min: number, from: number, to: number) =>
  Number.isInteger(min) &&
  min >= from &&
  min <= to &&
  min % SERVICE_MINUTES_STEP === 0;

/** Default Czas trwania of a Usługa: 5–600 min, in steps of 5. */
export const isServiceDuration = (min: number) =>
  inSteps(min, SERVICE_DURATION_MIN, SERVICE_DURATION_MAX);

/** Default Przerwa po Wizycie of a Usługa: 0–120 min, in steps of 5. */
export const isServiceBreak = (min: number) =>
  inSteps(min, 0, SERVICE_BREAK_MAX);

/** `7950` → `"79,50"`, `8000` → `"80"`: złote with a comma, grosze only when there are any. */
export function priceInput(grosze: number): string {
  const zloty = Math.floor(grosze / 100);
  const rest = grosze % 100;
  return rest === 0 ? `${zloty}` : `${zloty},${String(rest).padStart(2, '0')}`;
}

/** The Cena as the Wizytówka and the panel show it: "80 zł", "od 80 zł", "79,50 zł". */
export function formatPrice(grosze: number, type: PriceType): string {
  const amount = `${priceInput(grosze)} zł`;
  return type === 'FROM' ? `od ${amount}` : amount;
}

const PRICE = /^(\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:[,.](\d{1,2}))?$/;

/**
 * What the Właściciel types as the Cena, in złote: "80", "79,50", "79.5", "1 200".
 * Grosze, or `null` when it is not an amount.
 */
export function parsePrice(text: string): number | null {
  const match = PRICE.exec(text.trim());
  if (!match) return null;
  const zloty = Number(match[1].replace(/[ \u00a0]/g, ''));
  const grosze = Number((match[2] ?? '').padEnd(2, '0'));
  return zloty * 100 + grosze;
}

import { PriceType } from './public-page';
import {
  isServiceBreak,
  isServiceDuration,
  SERVICE_BREAK_INVALID,
  SERVICE_DURATION_INVALID,
} from './services';

export type VisitState = 'SCHEDULED' | 'CANCELLED' | 'NO_SHOW';

/**
 * The Stan Wizyty to show. A Zaplanowana Wizyta that has already started is one that
 * took place, so it reads "Odbyta".
 */
export function visitStateLabel(
  visit: { state: VisitState; startsAt: string },
  now: Date,
): string {
  switch (visit.state) {
    case 'CANCELLED':
      return 'Odwołana';
    case 'NO_SHOW':
      return 'Nieodbyta';
    case 'SCHEDULED':
      return new Date(visit.startsAt) <= now ? 'Odbyta' : 'Zaplanowana';
  }
}

/** A Usługa of a Wizyta as it was when it was added: the Cennik may have changed since. */
export interface VisitServiceView {
  serviceId: string;
  name: string;
  priceGrosze: number;
  priceType: PriceType;
}

/** One Wizyta in the replies of `/api/visits`. Dates in ISO 8601. */
export interface VisitView {
  id: string;
  staffMemberId: string;
  clientId: string;
  startsAt: string;
  durationMin: number;
  /** Przerwa po Wizycie */
  breakMin: number;
  description: string | null;
  state: VisitState;
  services: VisitServiceView[];
  createdById: string;
  updatedById: string;
}

/**
 * `POST /api/visits` body. Replies `201` with the new `VisitView`.
 * `422` for a person who does not accept Wizyty, an archived Usługa, a deleted Klient,
 * a Czas trwania or Przerwa out of range, or no Usługi and no description.
 */
export interface CreateVisitRequest {
  staffMemberId: string;
  clientId: string;
  /** ISO 8601 with an offset. */
  startsAt: string;
  durationMin: number;
  /** `0` when left out. */
  breakMin?: number;
  /** In any order; each Usługa once. `[]` when left out. */
  serviceIds?: string[];
  /** Required when there are no Usługi; blank = none. */
  description?: string | null;
  /** Save despite a Kolizja. Without it a Kolizja answers `409` with `VisitCollisionResponse`. */
  acceptCollisions?: boolean;
}

/**
 * `PATCH /api/visits/:id` body: only the fields to change. Usługi kept in `serviceIds`
 * keep their snapshot, new ones get the current Cennik. Replies with the `VisitView`.
 * Kolizje are checked when the person or the time changes.
 */
export type UpdateVisitRequest = Partial<CreateVisitRequest>;

/**
 * `POST /api/visits/:id/cancel`, `/no-show` and `/restore` reply with the `VisitView`,
 * or `422` when the Stan Wizyty does not allow it. `/restore` also answers `422` for a
 * deleted person or Klient, and checks Kolizje; its body
 * may carry `acceptCollisions`. `DELETE /api/visits/:id` replies `204`.
 */
export interface RestoreVisitRequest {
  acceptCollisions?: boolean;
}

/** A Wizyta or Nieobecność of the same person that a Wizyta would overlap. */
export interface VisitCollision {
  type: 'visit' | 'absence';
  id: string;
  startsAt: string;
  /** For a Wizyta: after its Przerwa. */
  endsAt: string;
  /** The Klient of a Wizyta, the reason of a Nieobecność. */
  label: string;
}

/** `409` body of a save that would make a Kolizja. */
export interface VisitCollisionResponse {
  statusCode: 409;
  error: 'Conflict';
  message: string;
  collisions: VisitCollision[];
}

export const VISIT_DESCRIPTION_MAX_LENGTH = 1000;

/** Czas trwania of a Wizyta: 5–600 min, in steps of 5, like a Usługa. */
export const isVisitDuration = isServiceDuration;
/** Przerwa po Wizycie: 0–120 min, in steps of 5, like a Usługa. */
export const isVisitBreak = isServiceBreak;

export const VISIT_DURATION_INVALID = SERVICE_DURATION_INVALID;
export const VISIT_BREAK_INVALID = SERVICE_BREAK_INVALID;
export const VISIT_STARTS_AT_INVALID = 'Wybierz datę i godzinę';
export const VISIT_STAFF_REQUIRED = 'Wybierz osobę';
export const VISIT_CLIENT_REQUIRED = 'Wybierz Klienta';
export const VISIT_DESCRIPTION_TOO_LONG = `Opis może mieć najwyżej ${VISIT_DESCRIPTION_MAX_LENGTH} znaków`;
/** `422` */
export const VISIT_DESCRIPTION_REQUIRED = 'Wybierz Usługę albo wpisz opis';
/** `422`: another Salon's person, a deleted one, or one who does not accept Wizyty. */
export const VISIT_STAFF_UNAVAILABLE = 'Tej osobie nie można wpisać Wizyty';
/** `422`: another Salon's Usługa or an archived one. */
export const VISIT_SERVICE_UNAVAILABLE = 'Tej Usługi nie można wybrać';
/** `422`: another Salon's Klient or a deleted one. */
export const VISIT_CLIENT_UNAVAILABLE = 'Tego Klienta nie można wybrać';
/** `422` from `/cancel`, `/no-show` and `/restore`. */
export const VISIT_STATE_CHANGE_INVALID =
  'Tej zmiany nie można zrobić w obecnym Stanie Wizyty';
/** `409` message; the body also lists the Kolizje. */
export const VISIT_COLLISION = 'Wizyta nachodzi na inne wpisy tej osoby';

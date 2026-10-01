import { HttpErrorResponse } from '@angular/common/http';
import {
  CalendarDay,
  CreateVisitRequest,
  UpdateVisitRequest,
  VisitCollision,
  VisitCollisionResponse,
  VisitView,
  warsawInstant,
} from '@bookit/shared';

/** What the Wizyta form holds when it is saved. */
export interface VisitFields {
  staffMemberId: string;
  clientId: string;
  day: CalendarDay;
  /** `HH:mm` on the Warsaw clock. */
  time: string;
  durationMin: number;
  breakMin: number;
  serviceIds: string[];
  description: string;
}

/** The `POST /api/visits` body of the form; a blank description is none. */
export function createRequest(fields: VisitFields): CreateVisitRequest {
  return {
    staffMemberId: fields.staffMemberId,
    clientId: fields.clientId,
    startsAt: warsawInstant(fields.day, fields.time).toISOString(),
    durationMin: fields.durationMin,
    breakMin: fields.breakMin,
    serviceIds: fields.serviceIds,
    description: fields.description.trim() || null,
  };
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/**
 * The `PATCH` body: only what differs from the saved Wizyta. A Klient left as he was is
 * not sent, so a Wizyta of an Usunięty Klient can still be moved.
 */
export function updateRequest(
  visit: VisitView,
  body: CreateVisitRequest,
): UpdateVisitRequest {
  const changes: UpdateVisitRequest = {};
  if (body.staffMemberId !== visit.staffMemberId) {
    changes.staffMemberId = body.staffMemberId;
  }
  if (body.clientId !== visit.clientId) changes.clientId = body.clientId;
  if (
    new Date(body.startsAt).getTime() !== new Date(visit.startsAt).getTime()
  ) {
    changes.startsAt = body.startsAt;
  }
  if (body.durationMin !== visit.durationMin) {
    changes.durationMin = body.durationMin;
  }
  if (body.breakMin !== visit.breakMin) changes.breakMin = body.breakMin;
  const serviceIds = body.serviceIds ?? [];
  if (
    !sameSet(
      serviceIds,
      visit.services.map((s) => s.serviceId),
    )
  ) {
    changes.serviceIds = serviceIds;
  }
  if ((body.description ?? null) !== visit.description) {
    changes.description = body.description ?? null;
  }
  return changes;
}

/** The Kolizje of a `409` from saving a Wizyta, `null` for any other error. */
export function collisionsOf(error: unknown): VisitCollision[] | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 409) {
    return null;
  }
  const body = error.error as Partial<VisitCollisionResponse> | null;
  return Array.isArray(body?.collisions) ? body.collisions : null;
}

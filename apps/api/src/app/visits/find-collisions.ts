import { VisitState } from '@bookit/shared';

export const MINUTE_MS = 60_000;

/** The time a Wizyta takes up in one person's calendar: `[startsAt, endsAt)`. */
export interface Interval {
  staffMemberId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface CollisionVisit {
  id: string;
  staffMemberId: string;
  startsAt: Date;
  durationMin: number;
  breakMin: number;
  state: VisitState;
  label: string;
}

export interface CollisionAbsence {
  id: string;
  staffMemberId: string;
  startsAt: Date;
  endsAt: Date;
  label: string;
}

export interface Collision {
  type: 'visit' | 'absence';
  id: string;
  startsAt: Date;
  endsAt: Date;
  label: string;
}

/** A Wizyta takes up `[startsAt, startsAt + durationMin + breakMin)`, in real minutes. */
export function visitInterval(visit: {
  staffMemberId: string;
  startsAt: Date;
  durationMin: number;
  breakMin: number;
}): Interval {
  return {
    staffMemberId: visit.staffMemberId,
    startsAt: visit.startsAt,
    endsAt: new Date(
      visit.startsAt.getTime() +
        (visit.durationMin + visit.breakMin) * MINUTE_MS,
    ),
  };
}

/** The same person and the same time. */
export const sameInterval = (a: Interval, b: Interval) =>
  a.staffMemberId === b.staffMemberId &&
  a.startsAt.getTime() === b.startsAt.getTime() &&
  a.endsAt.getTime() === b.endsAt.getTime();

/** Half-open intervals: one ending when the other starts do not overlap. */
const overlaps = (a: Interval, b: Interval) =>
  a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/**
 * The Kolizje of `interval`: `SCHEDULED` Wizyty and Nieobecności of the same person
 * that overlap it, by start. The caller leaves out the Wizyta being edited.
 */
export function findCollisions(
  interval: Interval,
  visits: readonly CollisionVisit[],
  absences: readonly CollisionAbsence[],
): Collision[] {
  const samePerson = (other: { staffMemberId: string }) =>
    other.staffMemberId === interval.staffMemberId;

  const fromVisits = visits
    .filter((visit) => visit.state === 'SCHEDULED' && samePerson(visit))
    .map((visit) => ({ visit, taken: visitInterval(visit) }))
    .filter(({ taken }) => overlaps(interval, taken))
    .map(({ visit, taken }): Collision => ({
      type: 'visit',
      id: visit.id,
      startsAt: taken.startsAt,
      endsAt: taken.endsAt,
      label: visit.label,
    }));
  const fromAbsences = absences
    .filter((absence) => samePerson(absence) && overlaps(interval, absence))
    .map((absence): Collision => ({
      type: 'absence',
      id: absence.id,
      startsAt: absence.startsAt,
      endsAt: absence.endsAt,
      label: absence.label,
    }));

  return [...fromVisits, ...fromAbsences].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
}

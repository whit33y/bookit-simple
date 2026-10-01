import { CalendarDay } from './calendar-day';
import { VisitServiceView, VisitState } from './visits';

export type VisitChangeAction =
  'CREATED' | 'UPDATED' | 'CANCELLED' | 'NO_SHOW' | 'RESTORED' | 'DELETED';

/**
 * A Wizyta as it was at the moment of a change, with the names of its person and
 * Klient from that moment: they may be changed or deleted later.
 */
export interface VisitSnapshot {
  staffMemberId: string;
  staffMemberName: string;
  clientId: string;
  clientName: string;
  /** ISO 8601 */
  startsAt: string;
  durationMin: number;
  breakMin: number;
  description: string | null;
  state: VisitState;
  services: VisitServiceView[];
}

/**
 * One entry of the Historia zmian. `before` is `null` for `CREATED`, `after` for
 * `DELETED`. `staffMemberId` and `staffMemberName` are who made the change.
 */
export interface VisitChangeView {
  id: string;
  visitId: string;
  /** ISO 8601 */
  at: string;
  action: VisitChangeAction;
  staffMemberId: string;
  staffMemberName: string;
  before: VisitSnapshot | null;
  after: VisitSnapshot | null;
}

/**
 * `GET /api/visit-changes` query, only for the Właściciel. `day` is the day of the
 * change in Europe/Warsaw, `staffId` who made it, `clientId` the Klient of the Wizyta
 * before or after it. `page` counts from 1.
 */
export interface VisitChangeQuery {
  day?: CalendarDay;
  staffId?: string;
  clientId?: string;
  page?: number;
}

/**
 * `GET /api/visit-changes` reply: newest first, `VISIT_CHANGES_PAGE_SIZE` a page.
 * `GET /api/visits/:id/changes` replies with all entries of one Wizyta, newest first.
 */
export interface VisitChangePage {
  items: VisitChangeView[];
  page: number;
  pageSize: number;
  total: number;
}

export const VISIT_CHANGES_PAGE_SIZE = 50;
export const VISIT_CHANGE_QUERY_INVALID = 'Nieprawidłowy filtr Historii zmian';

const WARSAW = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'Europe/Warsaw',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `5.10.2026` and `14:00` in Europe/Warsaw. */
function warsawParts(iso: string): { day: string; time: string } {
  const parts = Object.fromEntries(
    WARSAW.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  return {
    day: `${Number(parts['day'])}.${parts['month'].padStart(2, '0')}.${parts['year']}`,
    time: `${parts['hour']}:${parts['minute']}`,
  };
}

/** `5.10.2026` in Europe/Warsaw. */
export function formatWarsawDate(iso: string): string {
  return warsawParts(iso).day;
}

/** `5.10.2026, 14:00` */
export function formatWarsawDateTime(iso: string): string {
  const { day, time } = warsawParts(iso);
  return `${day}, ${time}`;
}

function formatMove(from: string, to: string): string {
  const a = warsawParts(from);
  const b = warsawParts(to);
  return a.day === b.day
    ? `${a.day}, ${a.time} → ${b.time}`
    : `${a.day}, ${a.time} → ${b.day}, ${b.time}`;
}

const serviceNames = (visit: VisitSnapshot) =>
  visit.services.map((service) => service.name).join(', ') || 'brak';

const quoted = (text: string | null) => (text === null ? 'brak' : `„${text}”`);

/** One line per field that differs, in the order of the Wizyta form. */
function differences(before: VisitSnapshot, after: VisitSnapshot): string[] {
  const lines: string[] = [];
  const add = (label: string, from: string, to: string) => {
    if (from !== to) lines.push(`${label}: ${from} → ${to}`);
  };
  if (before.startsAt !== after.startsAt) {
    lines.push(`Godzina: ${formatMove(before.startsAt, after.startsAt)}`);
  }
  if (before.staffMemberId !== after.staffMemberId) {
    add('Osoba', before.staffMemberName, after.staffMemberName);
  }
  if (before.clientId !== after.clientId) {
    add('Klient', before.clientName, after.clientName);
  }
  if (before.durationMin !== after.durationMin) {
    lines.push(
      `Czas trwania: ${before.durationMin} → ${after.durationMin} min`,
    );
  }
  if (before.breakMin !== after.breakMin) {
    lines.push(`Przerwa: ${before.breakMin} → ${after.breakMin} min`);
  }
  add('Usługi', serviceNames(before), serviceNames(after));
  add('Opis', quoted(before.description), quoted(after.description));
  return lines;
}

const HEADINGS: Record<VisitChangeAction, string> = {
  CREATED: 'Nowa Wizyta',
  UPDATED: 'Zmiana Wizyty',
  CANCELLED: 'Odwołanie Wizyty',
  NO_SHOW: 'Wizyta nieodbyta',
  RESTORED: 'Przywrócenie Wizyty',
  DELETED: 'Usunięcie Wizyty',
};

/**
 * A readable Historia zmian entry: a summary with the Klient and a line per detail.
 * Who made the change is shown next to it, so the text needs no gendered verb.
 */
export function describeVisitChange(change: VisitChangeView): {
  summary: string;
  details: string[];
} {
  const { action, before, after } = change;
  if (action === 'UPDATED' && before && after) {
    const details = differences(before, after);
    const moved = details.length === 1 && before.startsAt !== after.startsAt;
    return {
      summary: `${moved ? 'Przesunięcie Wizyty' : 'Zmiana Wizyty'}: ${after.clientName}`,
      details: details.length ? details : ['Bez zmian'],
    };
  }
  const visit = (after ?? before) as VisitSnapshot;
  return {
    summary: `${HEADINGS[action]}: ${visit.clientName}`,
    details: [
      `${formatWarsawDateTime(visit.startsAt)}, ${visit.staffMemberName}`,
    ],
  };
}

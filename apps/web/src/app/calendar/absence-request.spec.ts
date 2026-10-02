import { HttpErrorResponse } from '@angular/common/http';
import {
  ABSENCE_ENDS_BEFORE_START,
  ABSENCE_STAFF_UNAVAILABLE,
  AbsenceView,
} from '@bookit/shared';
import {
  absenceChanges,
  absenceFields,
  AbsenceFields,
  absenceRequest,
  fieldOfError,
  newAbsenceFields,
} from './absence-request';

const FIELDS: AbsenceFields = {
  staffMemberId: 'kasia',
  allDay: true,
  fromDay: '2026-11-13',
  fromTime: '09:00',
  toDay: '2026-11-13',
  toTime: '17:00',
  reason: '  ',
};

const ABSENCE: AbsenceView = {
  id: 'a1',
  staffMemberId: 'kasia',
  // 10:00–12:30 in Warsaw.
  startsAt: '2026-11-13T09:00:00.000Z',
  endsAt: '2026-11-13T11:30:00.000Z',
  reason: 'Lekarz',
};

describe('absenceRequest', () => {
  it('takes a whole day from midnight to midnight in Warsaw, and a blank reason as none', () => {
    expect(absenceRequest(FIELDS)).toEqual({
      staffMemberId: 'kasia',
      startsAt: '2026-11-12T23:00:00.000Z',
      endsAt: '2026-11-13T23:00:00.000Z',
      reason: null,
    });
  });

  it('takes whole days across the change of the clocks up to the end of the last one', () => {
    const body = absenceRequest({
      ...FIELDS,
      fromDay: '2026-10-24',
      toDay: '2026-10-26',
    });
    // Summer time on Saturday, winter time on Monday: 73 hours.
    expect(body.startsAt).toBe('2026-10-23T22:00:00.000Z');
    expect(body.endsAt).toBe('2026-10-26T23:00:00.000Z');
  });

  it('takes the Warsaw times when not on whole days, and trims the reason', () => {
    expect(
      absenceRequest({
        ...FIELDS,
        allDay: false,
        fromTime: '10:00',
        toTime: '12:30',
        reason: ' Lekarz ',
      }),
    ).toEqual({
      staffMemberId: 'kasia',
      startsAt: '2026-11-13T09:00:00.000Z',
      endsAt: '2026-11-13T11:30:00.000Z',
      reason: 'Lekarz',
    });
  });
});

describe('absenceFields', () => {
  it('reads the Warsaw dates and times of a Nieobecność within a day', () => {
    expect(absenceFields(ABSENCE)).toEqual({
      staffMemberId: 'kasia',
      allDay: false,
      fromDay: '2026-11-13',
      fromTime: '10:00',
      toDay: '2026-11-13',
      toTime: '12:30',
      reason: 'Lekarz',
    });
  });

  it('reads one from midnight to midnight as whole days, the last one included', () => {
    const fields = absenceFields({
      ...ABSENCE,
      startsAt: '2026-10-23T22:00:00.000Z',
      endsAt: '2026-10-26T23:00:00.000Z',
      reason: null,
    });
    expect(fields).toMatchObject({
      allDay: true,
      fromDay: '2026-10-24',
      toDay: '2026-10-26',
      reason: '',
    });
  });

  it('gives back the same instants', () => {
    for (const absence of [
      ABSENCE,
      {
        ...ABSENCE,
        startsAt: '2026-10-23T22:00:00.000Z',
        endsAt: '2026-10-26T23:00:00.000Z',
      },
    ]) {
      const body = absenceRequest(absenceFields(absence));
      expect([body.startsAt, body.endsAt]).toEqual([
        absence.startsAt,
        absence.endsAt,
      ]);
    }
  });
});

describe('newAbsenceFields', () => {
  it('starts with the whole of the day for the person', () => {
    expect(newAbsenceFields('2026-11-13', 'kasia')).toEqual({
      ...FIELDS,
      reason: '',
    });
  });
});

describe('absenceChanges', () => {
  it('is empty when nothing changed', () => {
    expect(
      absenceChanges(ABSENCE, absenceRequest(absenceFields(ABSENCE))),
    ).toEqual({});
  });

  it('has only what changed', () => {
    expect(
      absenceChanges(ABSENCE, {
        ...absenceRequest(absenceFields(ABSENCE)),
        endsAt: '2026-11-13T12:00:00.000Z',
        reason: null,
      }),
    ).toEqual({ endsAt: '2026-11-13T12:00:00.000Z', reason: null });
  });
});

describe('fieldOfError', () => {
  const reply = (status: number, message: string) =>
    new HttpErrorResponse({
      status,
      error: { message, error: 'Unprocessable Entity' },
    });

  it('puts the end before the start under the end', () => {
    expect(fieldOfError(reply(422, ABSENCE_ENDS_BEFORE_START))).toBe('toDay');
  });

  it('puts a person who cannot have one under the person', () => {
    expect(fieldOfError(reply(422, ABSENCE_STAFF_UNAVAILABLE))).toBe(
      'staffMemberId',
    );
  });

  it('has no field for the rest', () => {
    expect(fieldOfError(reply(500, ABSENCE_ENDS_BEFORE_START))).toBeNull();
    expect(fieldOfError(new Error('offline'))).toBeNull();
  });
});

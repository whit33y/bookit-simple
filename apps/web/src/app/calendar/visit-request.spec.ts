import { HttpErrorResponse } from '@angular/common/http';
import { VisitView } from '@bookit/shared';
import {
  collisionsOf,
  createRequest,
  updateRequest,
  VisitFields,
} from './visit-request';

const FIELDS: VisitFields = {
  staffMemberId: 'kasia',
  clientId: 'c1',
  day: '2026-11-12',
  time: '10:00',
  durationMin: 75,
  breakMin: 10,
  serviceIds: ['s1', 's2'],
  description: '  ',
};

const VISIT: VisitView = {
  id: 'v1',
  staffMemberId: 'kasia',
  clientId: 'c1',
  startsAt: '2026-11-12T09:00:00.000Z',
  durationMin: 75,
  breakMin: 10,
  description: null,
  state: 'SCHEDULED',
  services: [
    { serviceId: 's2', name: 'B', priceGrosze: 1, priceType: 'FIXED' },
    { serviceId: 's1', name: 'A', priceGrosze: 1, priceType: 'FIXED' },
  ],
  createdById: 'kasia',
  updatedById: 'kasia',
};

describe('createRequest', () => {
  it('takes the Warsaw date and time, and a blank description as none', () => {
    expect(createRequest(FIELDS)).toEqual({
      staffMemberId: 'kasia',
      clientId: 'c1',
      startsAt: '2026-11-12T09:00:00.000Z',
      durationMin: 75,
      breakMin: 10,
      serviceIds: ['s1', 's2'],
      description: null,
    });
  });

  it('trims the description', () => {
    expect(
      createRequest({ ...FIELDS, description: ' Grzywka ' }).description,
    ).toBe('Grzywka');
  });
});

describe('updateRequest', () => {
  it('is empty when nothing changed, whatever the order of the Usługi', () => {
    expect(updateRequest(VISIT, createRequest(FIELDS))).toEqual({});
  });

  it('has only the changed fields', () => {
    const body = createRequest({
      ...FIELDS,
      staffMemberId: 'ola',
      time: '11:30',
      serviceIds: ['s1'],
      description: 'Grzywka',
    });
    expect(updateRequest(VISIT, body)).toEqual({
      staffMemberId: 'ola',
      startsAt: '2026-11-12T10:30:00.000Z',
      serviceIds: ['s1'],
      description: 'Grzywka',
    });
  });
});

describe('collisionsOf', () => {
  it('reads the Kolizje of a 409', () => {
    const collisions = [
      {
        type: 'visit',
        id: 'v2',
        startsAt: '2026-11-12T09:00:00.000Z',
        endsAt: '2026-11-12T10:00:00.000Z',
        label: 'Anna',
      },
    ];
    const error = new HttpErrorResponse({
      status: 409,
      error: { statusCode: 409, message: 'x', collisions },
    });
    expect(collisionsOf(error)).toEqual(collisions);
  });

  it('is null for any other error', () => {
    expect(collisionsOf(new HttpErrorResponse({ status: 422 }))).toBeNull();
    expect(collisionsOf(new Error('x'))).toBeNull();
  });
});

import { BadRequestException } from '@nestjs/common';
import {
  CreateVisitRequest,
  RestoreVisitRequest,
  UpdateVisitRequest,
  VISIT_BREAK_INVALID,
  VISIT_CLIENT_REQUIRED,
  VISIT_DESCRIPTION_MAX_LENGTH,
  VISIT_DESCRIPTION_TOO_LONG,
  VISIT_DURATION_INVALID,
  VISIT_SERVICE_UNAVAILABLE,
  VISIT_STAFF_REQUIRED,
  VISIT_STARTS_AT_INVALID,
} from '@bookit/shared';
import { z } from 'zod';

const fields = {
  staffMemberId: z.uuid({ error: VISIT_STAFF_REQUIRED }),
  clientId: z.uuid({ error: VISIT_CLIENT_REQUIRED }),
  /** Needs an offset, so the instant is never guessed. */
  startsAt: z.iso
    .datetime({ offset: true, error: VISIT_STARTS_AT_INVALID })
    .transform((text) => new Date(text)),
  /** Any number passes here; the service answers `422` for one out of range. */
  durationMin: z.number({ error: VISIT_DURATION_INVALID }),
  breakMin: z.number({ error: VISIT_BREAK_INVALID }),
  /** Each Usługa once. */
  serviceIds: z
    .array(z.uuid({ error: VISIT_SERVICE_UNAVAILABLE }), {
      error: VISIT_SERVICE_UNAVAILABLE,
    })
    .transform((ids) => [...new Set(ids)]),
  /** A blank one is no description. */
  description: z
    .string({ error: VISIT_DESCRIPTION_TOO_LONG })
    .trim()
    .max(VISIT_DESCRIPTION_MAX_LENGTH, VISIT_DESCRIPTION_TOO_LONG)
    .transform((text) => text || null)
    .nullable(),
  acceptCollisions: z.boolean().default(false),
};

export const createSchema = z.object({
  ...fields,
  breakMin: fields.breakMin.default(0),
  serviceIds: fields.serviceIds.default([]),
  description: fields.description.default(null),
}) satisfies z.ZodType<unknown, CreateVisitRequest>;

/** Fields left out stay as they are. */
export const updateSchema = z.object({
  staffMemberId: fields.staffMemberId.optional(),
  clientId: fields.clientId.optional(),
  startsAt: fields.startsAt.optional(),
  durationMin: fields.durationMin.optional(),
  breakMin: fields.breakMin.optional(),
  serviceIds: fields.serviceIds.optional(),
  description: fields.description.optional(),
  acceptCollisions: fields.acceptCollisions,
}) satisfies z.ZodType<unknown, UpdateVisitRequest>;

/** `/restore` may come without a body. */
export const restoreSchema = z
  .object({ acceptCollisions: fields.acceptCollisions })
  .default({ acceptCollisions: false }) satisfies z.ZodType<
  unknown,
  RestoreVisitRequest | undefined
>;

export type VisitFields = z.output<typeof createSchema>;
export type VisitChanges = z.output<typeof updateSchema>;

export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message);
  }
  return parsed.data;
}

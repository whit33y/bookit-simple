import { BadRequestException } from '@nestjs/common';
import {
  ABSENCE_ENDS_AT_INVALID,
  ABSENCE_REASON_MAX_LENGTH,
  ABSENCE_REASON_TOO_LONG,
  ABSENCE_STAFF_REQUIRED,
  ABSENCE_STARTS_AT_INVALID,
  CreateAbsenceRequest,
  UpdateAbsenceRequest,
} from '@bookit/shared';
import { z } from 'zod';

/** Needs an offset, so the instant is never guessed. */
const instant = (error: string) =>
  z.iso.datetime({ offset: true, error }).transform((text) => new Date(text));

const fields = {
  staffMemberId: z.uuid({ error: ABSENCE_STAFF_REQUIRED }),
  startsAt: instant(ABSENCE_STARTS_AT_INVALID),
  endsAt: instant(ABSENCE_ENDS_AT_INVALID),
  /** A blank one is no reason. */
  reason: z
    .string({ error: ABSENCE_REASON_TOO_LONG })
    .trim()
    .max(ABSENCE_REASON_MAX_LENGTH, ABSENCE_REASON_TOO_LONG)
    .transform((text) => text || null)
    .nullable(),
};

export const createSchema = z.object({
  ...fields,
  reason: fields.reason.default(null),
}) satisfies z.ZodType<unknown, CreateAbsenceRequest>;

/** Fields left out stay as they are. */
export const updateSchema = z.object({
  staffMemberId: fields.staffMemberId.optional(),
  startsAt: fields.startsAt.optional(),
  endsAt: fields.endsAt.optional(),
  reason: fields.reason.optional(),
}) satisfies z.ZodType<unknown, UpdateAbsenceRequest>;

export type AbsenceFields = z.output<typeof createSchema>;
export type AbsenceChanges = z.output<typeof updateSchema>;

export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message);
  }
  return parsed.data;
}

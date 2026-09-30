import { BadRequestException } from '@nestjs/common';
import {
  CreateServiceRequest,
  isServiceBreak,
  isServiceDuration,
  SERVICE_BREAK_INVALID,
  SERVICE_CATEGORY_REQUIRED,
  SERVICE_DESCRIPTION_MAX_LENGTH,
  SERVICE_DESCRIPTION_TOO_LONG,
  SERVICE_DURATION_INVALID,
  SERVICE_NAME_MAX_LENGTH,
  SERVICE_NAME_REQUIRED,
  SERVICE_NAME_TOO_LONG,
  SERVICE_PRICE_INVALID,
  SERVICE_PRICE_MAX_GROSZE,
  SERVICE_PRICE_TYPE_INVALID,
  ServiceOrderRequest,
  UpdateServiceRequest,
} from '@bookit/shared';
import { z } from 'zod';

const minutes = (valid: (min: number) => boolean, message: string) =>
  z.number({ error: message }).refine(valid, message);

const fields = {
  categoryId: z.uuid({ error: SERVICE_CATEGORY_REQUIRED }),
  name: z
    .string({ error: SERVICE_NAME_REQUIRED })
    .trim()
    .min(1, SERVICE_NAME_REQUIRED)
    .max(SERVICE_NAME_MAX_LENGTH, SERVICE_NAME_TOO_LONG),
  /** A blank one is no description. */
  description: z
    .string({ error: SERVICE_DESCRIPTION_TOO_LONG })
    .trim()
    .max(SERVICE_DESCRIPTION_MAX_LENGTH, SERVICE_DESCRIPTION_TOO_LONG)
    .transform((text) => text || null)
    .nullable(),
  priceGrosze: z
    .number({ error: SERVICE_PRICE_INVALID })
    .int(SERVICE_PRICE_INVALID)
    .min(0, SERVICE_PRICE_INVALID)
    .max(SERVICE_PRICE_MAX_GROSZE, SERVICE_PRICE_INVALID),
  priceType: z.enum(['FIXED', 'FROM'], { error: SERVICE_PRICE_TYPE_INVALID }),
  durationMin: minutes(isServiceDuration, SERVICE_DURATION_INVALID),
  breakMin: minutes(isServiceBreak, SERVICE_BREAK_INVALID),
  hidden: z.boolean(),
};

export const createSchema = z.object({
  ...fields,
  description: fields.description.default(null),
  breakMin: fields.breakMin.default(0),
  hidden: fields.hidden.default(false),
}) satisfies z.ZodType<Required<CreateServiceRequest>, CreateServiceRequest>;

/** Fields left out stay as they are. */
export const updateSchema = z
  .object(fields)
  .partial() satisfies z.ZodType<UpdateServiceRequest>;

export const orderSchema = z.object({
  categoryId: z.uuid(),
  ids: z.array(z.string()),
}) satisfies z.ZodType<ServiceOrderRequest>;

export type ServiceFields = z.output<typeof createSchema>;
export type ServiceChanges = z.output<typeof updateSchema>;

export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message);
  }
  return parsed.data;
}

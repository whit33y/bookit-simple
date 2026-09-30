import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
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
  ServiceView,
} from '@bookit/shared';
import { z } from 'zod';
import { Roles } from '../auth/access.decorators';
import { ServicesService } from './services.service';

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

const createSchema = z.object({
  ...fields,
  description: fields.description.default(null),
  breakMin: fields.breakMin.default(0),
  hidden: fields.hidden.default(false),
});

/** Fields left out stay as they are. */
const updateSchema = z.object(fields).partial();

const orderSchema = z.object({
  categoryId: z.uuid(),
  ids: z.array(z.string()),
}) satisfies z.ZodType<ServiceOrderRequest>;

export type ServiceFields = z.output<typeof createSchema>;
export type ServiceChanges = z.output<typeof updateSchema>;

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message);
  }
  return parsed.data;
}

/**
 * `/api/services`: the Właściciel manages the Usługi of the Cennik; the Pracownik only
 * sees them, to pick them for a Wizyta.
 */
@Controller('services')
@Roles('OWNER')
export class ServicesController {
  constructor(
    @Inject(ServicesService) private readonly services: ServicesService,
  ) {}

  /** Without archived Usługi, unless `?includeArchived=true`. */
  @Get()
  @Roles('OWNER', 'EMPLOYEE')
  list(
    @Query('includeArchived') includeArchived?: string,
  ): Promise<ServiceView[]> {
    return this.services.list(includeArchived === 'true');
  }

  @Post()
  create(@Body() body: unknown): Promise<ServiceView> {
    return this.services.create(parse(createSchema, body));
  }

  @Put('order')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(@Body() body: unknown): Promise<void> {
    const { categoryId, ids } = parse(orderSchema, body);
    return this.services.reorder(categoryId, ids);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<ServiceView> {
    return this.services.update(id, parse(updateSchema, body));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseUUIDPipe) id: string): Promise<ServiceView> {
    return this.services.archive(id);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  unarchive(@Param('id', ParseUUIDPipe) id: string): Promise<ServiceView> {
    return this.services.unarchive(id);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Put,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CLOCK_TIME_PATTERN,
  closesAfterOpens,
  OPENING_HOURS_CLOSES_BEFORE_OPENS,
  OPENING_HOURS_DUPLICATE_WEEKDAY,
  OPENING_HOURS_INVALID_TIME,
  OPENING_HOURS_INVALID_WEEKDAY,
  OpeningHoursDay,
} from '@bookit/shared';
import { z } from 'zod';
import { Roles } from '../auth/access.decorators';
import { OpeningHoursService } from './opening-hours.service';

const clockTime = z
  .string({ error: OPENING_HOURS_INVALID_TIME })
  .regex(CLOCK_TIME_PATTERN, OPENING_HOURS_INVALID_TIME);

const weekSchema = z
  .array(
    z.object({
      weekday: z
        .number({ error: OPENING_HOURS_INVALID_WEEKDAY })
        .int(OPENING_HOURS_INVALID_WEEKDAY)
        .min(1, OPENING_HOURS_INVALID_WEEKDAY)
        .max(7, OPENING_HOURS_INVALID_WEEKDAY),
      opensAt: clockTime,
      closesAt: clockTime,
    }),
  )
  .refine(
    (days) => new Set(days.map((d) => d.weekday)).size === days.length,
    OPENING_HOURS_DUPLICATE_WEEKDAY,
  ) satisfies z.ZodType<OpeningHoursDay[]>;

/**
 * `400` for a malformed week; `422` for a well-formed day that closes before it opens.
 * Only the picked fields reach the service.
 */
function parseWeek(body: unknown): OpeningHoursDay[] {
  const parsed = weekSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message);
  }
  if (!parsed.data.every(closesAfterOpens)) {
    throw new UnprocessableEntityException(OPENING_HOURS_CLOSES_BEFORE_OPENS);
  }
  return parsed.data;
}

/** `/api/opening-hours`: the weekly Godziny otwarcia, set by the Właściciel. */
@Controller('opening-hours')
@Roles('OWNER')
export class OpeningHoursController {
  constructor(
    @Inject(OpeningHoursService) private readonly hours: OpeningHoursService,
  ) {}

  @Get()
  list(): Promise<OpeningHoursDay[]> {
    return this.hours.list();
  }

  @Put()
  replace(@Body() body: unknown): Promise<OpeningHoursDay[]> {
    return this.hours.replace(parseWeek(body));
  }
}

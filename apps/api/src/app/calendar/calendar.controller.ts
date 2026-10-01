import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  addDays,
  CALENDAR_DAY_INVALID,
  CALENDAR_MAX_DAYS,
  CALENDAR_RANGE_REVERSED,
  CALENDAR_RANGE_TOO_LONG,
  CalendarQuery,
  CalendarResponse,
  isCalendarDay,
} from '@bookit/shared';
import { z } from 'zod';
import { CalendarService } from './calendar.service';

const day = z.string().refine(isCalendarDay);

const querySchema = z.object({
  from: day,
  to: day,
}) satisfies z.ZodType<CalendarQuery>;

/**
 * `400` for a missing or malformed day, `422` for `to` before `from` or more than
 * `CALENDAR_MAX_DAYS` days. `YYYY-MM-DD` strings compare like the days they name.
 */
function parseRange(query: unknown): CalendarQuery {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) throw new BadRequestException(CALENDAR_DAY_INVALID);
  const { from, to } = parsed.data;
  if (to < from) {
    throw new UnprocessableEntityException(CALENDAR_RANGE_REVERSED);
  }
  if (to > addDays(from, CALENDAR_MAX_DAYS - 1)) {
    throw new UnprocessableEntityException(CALENDAR_RANGE_TOO_LONG);
  }
  return { from, to };
}

/** `/api/calendar`: what the Personel's day and week views draw (#28). */
@Controller('calendar')
export class CalendarController {
  constructor(
    @Inject(CalendarService) private readonly calendar: CalendarService,
  ) {}

  @Get()
  get(@Query() query: unknown): Promise<CalendarResponse> {
    return this.calendar.get(parseRange(query));
  }
}

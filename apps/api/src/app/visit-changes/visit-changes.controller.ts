import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  isCalendarDay,
  VISIT_CHANGE_QUERY_INVALID,
  VisitChangePage,
  VisitChangeView,
} from '@bookit/shared';
import { z } from 'zod';
import { Roles } from '../auth/access.decorators';
import {
  VisitChangeFilter,
  VisitChangesService,
} from './visit-changes.service';

/** Query strings: `page` comes as text. */
const querySchema = z.object({
  day: z.string().refine(isCalendarDay).optional(),
  staffId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
}) satisfies z.ZodType<VisitChangeFilter>;

/** The Historia zmian, only for the Właściciel (#25). `403` for a Pracownik. */
@Controller()
@Roles('OWNER')
export class VisitChangesController {
  constructor(
    @Inject(VisitChangesService) private readonly changes: VisitChangesService,
  ) {}

  /** Every entry of one Wizyta, also a deleted one, newest first. */
  @Get('visits/:id/changes')
  forVisit(@Param('id', ParseUUIDPipe) id: string): Promise<VisitChangeView[]> {
    return this.changes.forVisit(id);
  }

  @Get('visit-changes')
  list(@Query() query: unknown): Promise<VisitChangePage> {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(VISIT_CHANGE_QUERY_INVALID);
    }
    return this.changes.list(parsed.data);
  }
}

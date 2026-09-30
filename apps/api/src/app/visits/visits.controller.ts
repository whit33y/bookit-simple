import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { VisitView } from '@bookit/shared';
import {
  createSchema,
  parse,
  restoreSchema,
  updateSchema,
} from './visits.schemas';
import { VisitsService } from './visits.service';

/**
 * `/api/visits`: the Personel enters and changes Wizyty. `422` for invalid data or a
 * change the Stan Wizyty does not allow, `409` for a Kolizja without `acceptCollisions`.
 */
@Controller('visits')
export class VisitsController {
  constructor(@Inject(VisitsService) private readonly visits: VisitsService) {}

  @Post()
  create(@Body() body: unknown): Promise<VisitView> {
    return this.visits.create(parse(createSchema, body));
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<VisitView> {
    return this.visits.update(id, parse(updateSchema, body));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<VisitView> {
    return this.visits.changeState(id, 'CANCELLED');
  }

  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  noShow(@Param('id', ParseUUIDPipe) id: string): Promise<VisitView> {
    return this.visits.changeState(id, 'NO_SHOW');
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<VisitView> {
    const { acceptCollisions } = parse(restoreSchema, body);
    return this.visits.changeState(id, 'SCHEDULED', acceptCollisions);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.visits.remove(id);
  }
}

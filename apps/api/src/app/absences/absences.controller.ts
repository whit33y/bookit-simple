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
import { AbsenceView } from '@bookit/shared';
import { createSchema, parse, updateSchema } from './absences.schemas';
import { AbsencesService } from './absences.service';

/**
 * `/api/absences`: the Personel blocks time in a person's calendar. `400` for invalid
 * data, `422` for `endsAt` not after `startsAt` or a person who cannot have one.
 */
@Controller('absences')
export class AbsencesController {
  constructor(
    @Inject(AbsencesService) private readonly absences: AbsencesService,
  ) {}

  @Post()
  create(@Body() body: unknown): Promise<AbsenceView> {
    return this.absences.create(parse(createSchema, body));
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<AbsenceView> {
    return this.absences.update(id, parse(updateSchema, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.absences.remove(id);
  }
}

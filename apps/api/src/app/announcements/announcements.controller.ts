import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ANNOUNCEMENT_BODY_MAX_LENGTH,
  ANNOUNCEMENT_BODY_REQUIRED,
  ANNOUNCEMENT_BODY_TOO_LONG,
  ANNOUNCEMENT_PHOTO_NOT_FOUND,
  ANNOUNCEMENT_SHOW_FROM_INVALID,
  ANNOUNCEMENT_SHOW_UNTIL_INVALID,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_REQUIRED,
  ANNOUNCEMENT_TITLE_TOO_LONG,
  AnnouncementView,
  CreateAnnouncementRequest,
  isCalendarDay,
  UpdateAnnouncementRequest,
} from '@bookit/shared';
import { z } from 'zod';
import { Roles } from '../auth/access.decorators';
import { AnnouncementsService } from './announcements.service';

const day = (message: string) =>
  z.string({ error: message }).refine(isCalendarDay, message);

const text = (max: number, required: string, tooLong: string) =>
  z.string({ error: required }).trim().min(1, required).max(max, tooLong);

const fields = {
  title: text(
    ANNOUNCEMENT_TITLE_MAX_LENGTH,
    ANNOUNCEMENT_TITLE_REQUIRED,
    ANNOUNCEMENT_TITLE_TOO_LONG,
  ),
  body: text(
    ANNOUNCEMENT_BODY_MAX_LENGTH,
    ANNOUNCEMENT_BODY_REQUIRED,
    ANNOUNCEMENT_BODY_TOO_LONG,
  ),
  photoId: z.uuid({ error: ANNOUNCEMENT_PHOTO_NOT_FOUND }).nullable(),
  showFrom: day(ANNOUNCEMENT_SHOW_FROM_INVALID),
  showUntil: day(ANNOUNCEMENT_SHOW_UNTIL_INVALID).nullable(),
};

const createSchema = z.object({
  ...fields,
  photoId: fields.photoId.default(null),
  showUntil: fields.showUntil.default(null),
}) satisfies z.ZodType<
  Required<CreateAnnouncementRequest>,
  CreateAnnouncementRequest
>;

/** Fields left out stay as they are. */
const updateSchema = z
  .object(fields)
  .partial() satisfies z.ZodType<UpdateAnnouncementRequest>;

export type AnnouncementFields = z.output<typeof createSchema>;
export type AnnouncementChanges = z.output<typeof updateSchema>;

/** `400` for a malformed body; only the picked fields reach the service. */
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message);
  }
  return parsed.data;
}

/** `/api/announcements`: the Właściciel manages the Ogłoszenia of the Wizytówka. */
@Controller('announcements')
@Roles('OWNER')
export class AnnouncementsController {
  constructor(
    @Inject(AnnouncementsService)
    private readonly announcements: AnnouncementsService,
  ) {}

  @Get()
  list(): Promise<AnnouncementView[]> {
    return this.announcements.list();
  }

  /** `422` when `showUntil` is before `showFrom`. */
  @Post()
  create(@Body() body: unknown): Promise<AnnouncementView> {
    return this.announcements.create(parse(createSchema, body));
  }

  /** `422` when the days, after the change, end before they start. */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<AnnouncementView> {
    return this.announcements.update(id, parse(updateSchema, body));
  }

  /** `404` for one of another Salon. Its Photo is not deleted. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.announcements.remove(id);
  }
}

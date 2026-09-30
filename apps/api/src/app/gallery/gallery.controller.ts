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
  Post,
  Put,
} from '@nestjs/common';
import {
  AddGalleryPhotoRequest,
  GALLERY_ORDER_MISMATCH,
  GALLERY_PHOTO_NOT_FOUND,
  GalleryOrderRequest,
  GalleryPhotoView,
} from '@bookit/shared';
import { z } from 'zod';
import { Roles } from '../auth/access.decorators';
import { GalleryService } from './gallery.service';

const addSchema = z.object({
  photoId: z.uuid({ error: GALLERY_PHOTO_NOT_FOUND }),
}) satisfies z.ZodType<AddGalleryPhotoRequest>;

const orderSchema = z.object({
  photoIds: z.array(z.string(), { error: GALLERY_ORDER_MISMATCH }),
}) satisfies z.ZodType<GalleryOrderRequest>;

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message);
  }
  return parsed.data;
}

/** `/api/gallery`: only the Właściciel manages the gallery of the Wizytówka. */
@Controller('gallery')
@Roles('OWNER')
export class GalleryController {
  constructor(
    @Inject(GalleryService) private readonly gallery: GalleryService,
  ) {}

  @Get()
  list(): Promise<GalleryPhotoView[]> {
    return this.gallery.list();
  }

  /** `422` for the Photo over the limit. */
  @Post()
  add(@Body() body: unknown): Promise<GalleryPhotoView> {
    return this.gallery.add(parse(addSchema, body).photoId);
  }

  @Put('order')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(@Body() body: unknown): Promise<void> {
    return this.gallery.reorder(parse(orderSchema, body).photoIds);
  }

  @Delete(':photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('photoId', ParseUUIDPipe) photoId: string): Promise<void> {
    return this.gallery.remove(photoId);
  }
}

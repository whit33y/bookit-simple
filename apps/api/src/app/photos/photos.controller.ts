import {
  BadRequestException,
  Body,
  CallHandler,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  NestInterceptor,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CropPhotoRequest,
  PHOTO_FILE_REQUIRED,
  PHOTO_MAX_BYTES,
  PHOTO_TOO_LARGE,
  PhotoView,
} from '@bookit/shared';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { catchError, Observable, throwError } from 'rxjs';
import { z } from 'zod';
import { Public, Roles } from '../auth/access.decorators';
import { AdminScope } from '../salon-context/admin-scope.decorator';
import { PHOTO_CONTENT_TYPE, PhotosService } from './photos.service';

/** A Photo never changes under its id: a new file gets a new Photo. */
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Multer's `413` says "File too large"; the Właściciel reads the limit instead. */
@Injectable()
class PhotoTooLargeMessage implements NestInterceptor {
  intercept(_: unknown, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          throwError(() =>
            error instanceof PayloadTooLargeException
              ? new PayloadTooLargeException(PHOTO_TOO_LARGE)
              : error,
          ),
        ),
      );
  }
}

/** Whole pixels of the source Photo; the service checks the square against its size. */
const pixels = z.int({ error: 'Nieprawidłowy kadr' });
const cropSchema = z.object({
  x: pixels,
  y: pixels,
  size: pixels,
}) satisfies z.ZodType<CropPhotoRequest>;

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message);
  }
  return parsed.data;
}

/** `/api/photos`: only the Właściciel adds and deletes Photos of the Salon. */
@Controller('photos')
@Roles('OWNER')
export class PhotosController {
  constructor(@Inject(PhotosService) private readonly photos: PhotosService) {}

  /** Multipart with the field `file`; `413` over 10 MB, `415` for other types. */
  @Post()
  @UseInterceptors(
    PhotoTooLargeMessage,
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: PHOTO_MAX_BYTES, files: 1 },
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File): Promise<PhotoView> {
    if (!file) throw new BadRequestException(PHOTO_FILE_REQUIRED);
    return this.photos.upload(file.buffer);
  }

  /** `{ x, y, size }` in pixels of the Photo; replies with the new Photo. */
  @Post(':id/crop')
  crop(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<PhotoView> {
    return this.photos.crop(id, parse(cropSchema, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.photos.remove(id);
  }
}

/** `/api/public/photos/:id`: the WebP for the Wizytówka, without a login. */
@Controller('public/photos')
@Public()
@AdminScope()
export class PublicPhotosController {
  constructor(@Inject(PhotosService) private readonly photos: PhotosService) {}

  @Get(':id')
  async file(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.photos.open(id);
    if (!file) throw new NotFoundException();
    // Not with `@Header()`: that one also lands on the `404`.
    res.setHeader('Cache-Control', CACHE_CONTROL);
    return new StreamableFile(file, { type: PHOTO_CONTENT_TYPE });
  }
}

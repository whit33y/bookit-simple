import { Module } from '@nestjs/common';
import { PhotoStorage, S3PhotoStorage } from './photo-storage';
import { PhotosController, PublicPhotosController } from './photos.controller';
import { PhotosService } from './photos.service';

/** `/api/photos` and `/api/public/photos`: uploading and serving Photos (#19). */
@Module({
  controllers: [PhotosController, PublicPhotosController],
  providers: [
    PhotosService,
    { provide: PhotoStorage, useClass: S3PhotoStorage },
  ],
  exports: [PhotosService],
})
export class PhotosModule {}

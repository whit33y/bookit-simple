import { Module } from '@nestjs/common';
import { PhotosModule } from '../photos/photos.module';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';

/** `/api/gallery`: the gallery of the Wizytówka (#21). */
@Module({
  imports: [PhotosModule],
  controllers: [GalleryController],
  providers: [GalleryService],
})
export class GalleryModule {}
